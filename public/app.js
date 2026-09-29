let store = { categories: [], products: [] };
let selectedCategory = null;

const $ = id => document.getElementById(id);
const money = n => n ? `₹${Number(n).toLocaleString("en-IN")}` : "Price on request";

async function loadStore() {
  const res = await fetch("/api/store");
  store = await res.json();
  $("year").textContent = new Date().getFullYear();
  renderCategories();
  renderProducts();
}

function renderCategories() {
  $("categoryCount").textContent = `${store.categories.length} categories`;
  $("categories").innerHTML = store.categories.map(c => `
    <div class="category-card ${selectedCategory === c.id ? "active" : ""}" data-cat="${c.id}">
      <div class="category-icon">${escapeHtml(c.icon)}</div>
      <div class="category-name">${escapeHtml(c.name)}</div>
      <div class="category-desc">${escapeHtml(c.description || "Explore this collection")}</div>
    </div>
  `).join("");

  document.querySelectorAll("[data-cat]").forEach(card => {
    card.addEventListener("click", () => {
      selectedCategory = card.dataset.cat;
      renderCategories();
      renderProducts();
      $("catalog").scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderProducts() {
  const search = $("search").value.trim().toLowerCase();
  let products = store.products.filter(p => {
    const catOK = !selectedCategory || String(p.category_id) === String(selectedCategory);
    const text = `${p.name} ${p.description} ${p.category_name}`.toLowerCase();
    return catOK && (!search || text.includes(search));
  });

  const cat = store.categories.find(c => String(c.id) === String(selectedCategory));
  $("activeCategory").innerHTML = selectedCategory
    ? `Showing: <strong>${escapeHtml(cat?.name || "")}</strong> &nbsp; <button id="clearFilter" style="border:0;background:none;color:inherit;cursor:pointer">Clear ×</button>`
    : "";

  if (!products.length) {
    $("products").innerHTML = "";
    $("empty").classList.remove("hidden");
    return;
  }
  $("empty").classList.add("hidden");

  $("products").innerHTML = products.map(p => `
    <article class="product-card" data-product="${p.id}">
      <div class="product-img">
        ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name)}">` : `<div class="placeholder">${escapeHtml(p.category_icon || "🍽️")}</div>`}
        ${p.featured ? `<span class="featured">FEATURED</span>` : ""}
      </div>
      <div class="product-info">
        <div class="product-cat">${escapeHtml(p.category_name)}</div>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-desc">${escapeHtml(p.description || "Quality household product.")}</div>
        <div class="product-bottom">
          <div>
            <div class="price">${money(p.price)}</div>
            <div class="unit">per ${escapeHtml(p.unit || "piece")}</div>
          </div>
          <div class="stock">${escapeHtml(p.stock_status || "In Stock")}</div>
        </div>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-product]").forEach(el => {
    el.addEventListener("click", () => openProduct(el.dataset.product));
  });

  $("clearFilter")?.addEventListener("click", () => {
    selectedCategory = null;
    renderCategories();
    renderProducts();
  });
}

function openProduct(id) {
  const p = store.products.find(x => String(x.id) === String(id));
  if (!p) return;
  $("modalImage").src = p.image || "";
  $("modalImage").alt = p.name;
  $("modalImage").style.display = p.image ? "block" : "none";
  $("modalCategory").textContent = p.category_name;
  $("modalName").textContent = p.name;
  $("modalDescription").textContent = p.description || "Quality household product available at our shop.";
  $("modalPrice").textContent = money(p.price);
  $("modalStock").textContent = p.stock_status || "IN STOCK";
  $("modal").classList.remove("hidden");
}

document.addEventListener("click", e => {
  if (e.target.matches("[data-close]")) $("modal").classList.add("hidden");
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") $("modal").classList.add("hidden");
});
$("search").addEventListener("input", renderProducts);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

loadStore().catch(err => {
  console.error(err);
  $("products").innerHTML = `<div class="empty"><h3>Could not load catalogue</h3><p>Start the Node.js server and refresh.</p></div>`;
});
