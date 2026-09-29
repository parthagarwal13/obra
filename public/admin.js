let editingProduct = null;
let editingCategory = null;
const $ = id => document.getElementById(id);

async function api(url, options={}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function init() {
  try {
    const me = await api("/api/admin/me");
    showAdmin(me.username);
  } catch {
    $("loginView").classList.remove("hidden");
  }
}

function showAdmin(username) {
  $("loginView").classList.add("hidden");
  $("adminView").classList.remove("hidden");
  $("adminName").textContent = username;
  loadDashboard();
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  try {
    const data = await api("/api/admin/login", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ username:$("username").value, password:$("password").value })
    });
    showAdmin(data.username);
  } catch(err) { $("loginError").textContent = err.message; }
});

$("logout").addEventListener("click", async () => {
  await api("/api/admin/logout", {method:"POST"});
  location.reload();
});

document.querySelectorAll(".nav").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
document.querySelectorAll("[data-goto]").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.goto));
});

function switchTab(tab) {
  document.querySelectorAll(".nav").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach(x => x.classList.add("hidden"));
  $(tab + "Tab").classList.remove("hidden");
  $("pageTitle").textContent = tab[0].toUpperCase() + tab.slice(1);
  if(tab==="dashboard") loadDashboard();
  if(tab==="products") loadProducts();
  if(tab==="categories") loadCategories();
}

async function loadDashboard() {
  const d = await api("/api/admin/dashboard");
  $("sProducts").textContent=d.products;
  $("sCategories").textContent=d.categories;
  $("sVisible").textContent=d.visible;
  $("sFeatured").textContent=d.featured;
}

async function loadCategories() {
  const cats = await api("/api/admin/categories");
  $("categoriesTable").innerHTML = `
    <div class="row head"><div>Category</div><div>Description</div><div>Created</div><div></div></div>
    ${cats.map(c => `
      <div class="row">
        <div><b style="font-size:20px">${escapeHtml(c.icon)}</b> &nbsp; <strong>${escapeHtml(c.name)}</strong></div>
        <div>${escapeHtml(c.description || "—")}</div>
        <div>${new Date(c.created_at).toLocaleDateString()}</div>
        <div class="actions">
          <button class="icon-btn" onclick="editCategory('${c.id}')">Edit</button>
          <button class="icon-btn" onclick="deleteCategory('${c.id}')">Delete</button>
        </div>
      </div>
    `).join("")}
  `;
}

async function loadProducts() {
  const products = await api("/api/admin/products");
  $("productsTable").innerHTML = `
    <div class="row head"><div>Product</div><div>Category</div><div>Price</div><div>Status</div><div>Actions</div></div>
    ${products.map(p => `
      <div class="row">
        <div>${p.image ? `<img class="thumb" src="${p.image}">` : `<span class="thumb" style="display:inline-grid;place-items:center">🍽️</span>`}<strong>${escapeHtml(p.name)}</strong></div>
        <div>${escapeHtml(p.category_name)}</div>
        <div>${p.price ? "₹"+Number(p.price).toLocaleString("en-IN") : "On request"}</div>
        <div><span class="status ${p.visible ? "" : "off"}">${p.visible ? "VISIBLE" : "HIDDEN"}</span></div>
        <div class="actions">
          <button class="icon-btn" onclick="editProduct('${p.id}')">Edit</button>
          <button class="icon-btn" onclick="deleteProduct('${p.id}')">Delete</button>
        </div>
      </div>
    `).join("")}
  `;
}

$("addCategory").addEventListener("click", () => openCategory());
$("addProduct").addEventListener("click", () => openProduct());

async function openCategory(id=null) {
  editingCategory = id;
  $("categoryError").textContent="";
  if(!id) {
    $("categoryModalTitle").textContent="Add Category";
    $("categoryId").value="";
    $("cName").value="";
    $("cIcon").value="🍽️";
    $("cDescription").value="";
  } else {
    const cats = await api("/api/admin/categories");
    const c = cats.find(x=>String(x.id)===String(id));
    $("categoryModalTitle").textContent="Edit Category";
    $("categoryId").value=c.id;
    $("cName").value=c.name;
    $("cIcon").value=c.icon;
    $("cDescription").value=c.description;
  }
  $("categoryModal").classList.remove("hidden");
}
window.editCategory = openCategory;

$("categoryForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("categoryError").textContent="";
  const body = {name:$("cName").value, icon:$("cIcon").value, description:$("cDescription").value};
  try {
    await api(editingCategory ? `/api/admin/categories/${editingCategory}` : "/api/admin/categories", {
      method: editingCategory ? "PUT":"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    closeModals(); loadCategories(); loadDashboard();
  } catch(err){$("categoryError").textContent=err.message}
});

window.deleteCategory = async id => {
  if(!confirm("Delete this category and all products inside it?")) return;
  try { await api(`/api/admin/categories/${id}`, {method:"DELETE"}); loadCategories(); loadDashboard(); }
  catch(err){alert(err.message)}
};

async function uploadImageToCloudinary(file) {
  const sig = await api("/api/admin/cloudinary-signature");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.apiKey);
  fd.append("timestamp", sig.timestamp);
  fd.append("folder", sig.folder);
  fd.append("signature", sig.signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method:"POST", body:fd
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error?.message || "Image upload failed");
  return data.secure_url;
}

async function openProduct(id=null) {
  editingProduct = id;
  $("productError").textContent="";
  const cats = await api("/api/admin/categories");
  $("pCategory").innerHTML = cats.map(c=>`<option value="${c.id}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join("");

  if(!id) {
    $("productModalTitle").textContent="Add Product";
    $("productId").value="";
    $("pName").value=""; $("pPrice").value=""; $("pDescription").value="";
    $("pUnit").value="piece"; $("pStock").value="In Stock";
    $("pFeatured").checked=false; $("pVisible").checked=true; $("pImage").value="";
  } else {
    const products = await api("/api/admin/products");
    const p = products.find(x=>String(x.id)===String(id));
    $("productModalTitle").textContent="Edit Product";
    $("productId").value=p.id;
    $("pName").value=p.name; $("pPrice").value=p.price;
    $("pDescription").value=p.description;
    $("pUnit").value=p.unit; $("pStock").value=p.stock_status;
    $("pCategory").value=p.category_id;
    $("pFeatured").checked=!!p.featured; $("pVisible").checked=!!p.visible;
    $("pImage").value="";
  }
  $("productModal").classList.remove("hidden");
}
window.editProduct = openProduct;

$("productForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("productError").textContent="";
  const saveBtn=e.submitter;
  if(saveBtn) { saveBtn.disabled=true; saveBtn.textContent="Saving..."; }

  try {
    let image;
    if($("pImage").files[0]) image=await uploadImageToCloudinary($("pImage").files[0]);

    const body = {
      category_id:$("pCategory").value,
      name:$("pName").value,
      price:$("pPrice").value,
      unit:$("pUnit").value,
      stock_status:$("pStock").value,
      description:$("pDescription").value,
      featured:$("pFeatured").checked,
      visible:$("pVisible").checked
    };
    if(image) body.image=image;

    await api(editingProduct ? `/api/admin/products/${editingProduct}` : "/api/admin/products", {
      method: editingProduct ? "PUT":"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    closeModals(); loadProducts(); loadDashboard();
  } catch(err){$("productError").textContent=err.message}
  finally {
    if(saveBtn) { saveBtn.disabled=false; saveBtn.textContent="Save Product"; }
  }
});

window.deleteProduct = async id => {
  if(!confirm("Delete this product permanently?")) return;
  try { await api(`/api/admin/products/${id}`, {method:"DELETE"}); loadProducts(); loadDashboard(); }
  catch(err){alert(err.message)}
};

document.querySelectorAll("[data-close]").forEach(x => x.addEventListener("click", closeModals));
document.querySelectorAll(".overlay").forEach(x => x.addEventListener("click", e => {
  if(e.target===x) closeModals();
}));
function closeModals(){ document.querySelectorAll(".overlay").forEach(x=>x.classList.add("hidden")); }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

init();
