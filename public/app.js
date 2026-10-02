let store = { categories: [], products: [] };
let selectedCategory = null;
const CART_STORAGE_KEY = "maiRamJaiBhagawanCart";
const $ = id => document.getElementById(id);
const rupee = String.fromCharCode(0x20B9);
const money = n => `${rupee}${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

let cart = readCart();

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item =>
      item && typeof item.id === "string" && Number.isInteger(item.quantity) && item.quantity > 0
    ) : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

async function loadStore() {
  const res = await fetch("/api/store");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Catalogue request failed (${res.status})`);
  store = data;
  $("cartButton").disabled = false;
  const available = new Set(store.products.map(product => String(product.id)));
  cart = cart.filter(item => available.has(item.id));
  saveCart();
  $("year").textContent = new Date().getFullYear();
  renderCategories();
  renderProducts();
  renderCart();
}

function renderCategories() {
  $("categoryCount").textContent = `${store.categories.length} categories`;
  $("categories").innerHTML = store.categories.map(c => `
    <div class="category-card ${selectedCategory === c.id ? "active" : ""}" data-cat="${escapeHtml(c.id)}">
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
  const products = store.products.filter(p => {
    const catOK = !selectedCategory || String(p.category_id) === String(selectedCategory);
    const text = `${p.name} ${p.description} ${p.category_name}`.toLowerCase();
    return catOK && (!search || text.includes(search));
  });

  const cat = store.categories.find(c => String(c.id) === String(selectedCategory));
  $("activeCategory").innerHTML = selectedCategory
    ? `Showing: <strong>${escapeHtml(cat?.name || "")}</strong> &nbsp; <button id="clearFilter" style="border:0;background:none;color:inherit;cursor:pointer">Clear</button>`
    : "";

  if (!products.length) {
    $("products").innerHTML = "";
    $("empty").classList.remove("hidden");
    return;
  }
  $("empty").classList.add("hidden");

  $("products").innerHTML = products.map(p => `
    <article class="product-card" data-product="${escapeHtml(p.id)}">
      <div class="product-img">
        ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : `<div class="placeholder">${escapeHtml(p.category_icon || "")}</div>`}
        ${p.featured ? `<span class="featured">FEATURED</span>` : ""}
      </div>
      <div class="product-info">
        <div class="product-cat">${escapeHtml(p.category_name)}</div>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-desc">${escapeHtml(p.description || "Quality household product.")}</div>
        <div class="product-bottom">
          <div>
            <div class="price">${p.price ? money(p.price) : "Price on request"}</div>
            <div class="unit">per ${escapeHtml(p.unit || "piece")}</div>
          </div>
          <div class="stock">${escapeHtml(p.stock_status || "In Stock")}</div>
        </div>
        <button class="add-cart" type="button" data-cart-add="${escapeHtml(p.id)}" ${p.stock_status === "Out of Stock" || Number(p.price) <= 0 ? "disabled" : ""}>
          ${p.stock_status === "Out of Stock" ? "Out of Stock" : Number(p.price) <= 0 ? "Price on Request" : "Add to Cart"}
        </button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-product]").forEach(el => {
    el.addEventListener("click", event => {
      const addButton = event.target.closest("[data-cart-add]");
      if (addButton) {
        event.stopPropagation();
        addToCart(addButton.dataset.cartAdd);
        return;
      }
      openProduct(el.dataset.product);
    });
  });

  $("clearFilter")?.addEventListener("click", () => {
    selectedCategory = null;
    renderCategories();
    renderProducts();
  });
}

function addToCart(id) {
  const product = store.products.find(item => String(item.id) === String(id));
  if (!product || product.stock_status === "Out of Stock" || Number(product.price) <= 0) return;
  const existing = cart.find(item => item.id === String(id));
  if (existing) existing.quantity = Math.min(existing.quantity + 1, 99);
  else cart.push({ id: String(id), quantity: 1 });
  saveCart();
  renderCart();
}

function updateCart(id, change) {
  const item = cart.find(row => row.id === id);
  if (!item) return;
  item.quantity += change;
  if (item.quantity <= 0) cart = cart.filter(row => row.id !== id);
  if (item.quantity > 99) item.quantity = 99;
  saveCart();
  renderCart();
}

function renderCart() {
  const cartProducts = cart.map(item => ({
    ...item,
    product: store.products.find(product => String(product.id) === item.id)
  })).filter(item => item.product);
  cart = cartProducts.map(({ id, quantity }) => ({ id, quantity }));
  saveCart();

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  $("cartCount").textContent = String(count);
  $("cartItems").innerHTML = cartProducts.length ? cartProducts.map(({ id, quantity, product }) => `
    <div class="cart-item">
      ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : `<div class="cart-item-image">${escapeHtml(product.category_icon || "")}</div>`}
      <div class="cart-item-copy">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${money(product.price)} / ${escapeHtml(product.unit || "piece")}</span>
        <div class="quantity-control">
          <button type="button" data-quantity="-1" data-id="${escapeHtml(id)}" aria-label="Decrease quantity">−</button>
          <span>${quantity}</span>
          <button type="button" data-quantity="1" data-id="${escapeHtml(id)}" aria-label="Increase quantity">+</button>
          <button class="remove-cart" type="button" data-remove-cart="${escapeHtml(id)}">Remove</button>
        </div>
      </div>
      <strong class="cart-line-total">${money(Number(product.price) * quantity)}</strong>
    </div>
  `).join("") : `<p class="cart-empty">Your cart is empty. Add a product to get started.</p>`;

  const total = cartProducts.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  $("cartTotal").textContent = money(total);
  $("placeOrder").disabled = cartProducts.length === 0;
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
  $("modalPrice").textContent = p.price ? money(p.price) : "Price on request";
  $("modalStock").textContent = p.stock_status || "IN STOCK";
  $("modal").classList.remove("hidden");
}

$("cartButton").addEventListener("click", () => {
  if ($("cartButton").disabled) return;
  renderCart();
  $("checkoutMessage").textContent = "";
  $("cartModal").classList.remove("hidden");
});

document.addEventListener("click", event => {
  if (event.target.matches("[data-close]")) $("modal").classList.add("hidden");
  if (event.target.matches("[data-close-cart]")) $("cartModal").classList.add("hidden");
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) updateCart(quantityButton.dataset.id, Number(quantityButton.dataset.quantity));
  const removeButton = event.target.closest("[data-remove-cart]");
  if (removeButton) {
    cart = cart.filter(item => item.id !== removeButton.dataset.removeCart);
    saveCart();
    renderCart();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    $("modal").classList.add("hidden");
    $("cartModal").classList.add("hidden");
    $("orderSuccess").classList.add("hidden");
  }
});

$("checkoutForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!cart.length) return;
  const checkoutForm = event.currentTarget;
  const button = $("placeOrder");
  const message = $("checkoutMessage");
  button.disabled = true;
  button.textContent = "Placing order...";
  message.textContent = "";
  message.classList.remove("error-message", "success-message");

  try {
    const form = new FormData(event.currentTarget);
    const customer = Object.fromEntries(form.entries());
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...customer, items: cart.map(({ id, quantity }) => ({ id, quantity })) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not place your order.");

    const orderRef = result.orderId.slice(0, 8).toUpperCase();
    cart = [];
    saveCart();
    renderCart();
    checkoutForm.reset();
    $("cartModal").classList.add("hidden");
    $("successGreeting").textContent = `Thank you, ${customer.name.trim()}! We appreciate your order.`;
    $("successOrderRef").textContent = orderRef;
    $("orderSuccess").classList.remove("hidden");
    $("continueShopping").focus();
  } catch (error) {
    message.textContent = error.message || "Could not place your order. Please try again.";
    message.classList.add("error-message");
  } finally {
    button.textContent = "Place Order";
    button.disabled = cart.length === 0;
  }
});

function closeOrderSuccess() {
  $("orderSuccess").classList.add("hidden");
}

document.querySelectorAll("[data-close-success]").forEach(element => {
  element.addEventListener("click", closeOrderSuccess);
});
$("continueShopping").addEventListener("click", closeOrderSuccess);

$("search").addEventListener("input", renderProducts);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

loadStore().catch(error => {
  console.error(error);
  $("products").innerHTML = `<div class="empty"><h3>Could not load catalogue</h3><p>${escapeHtml(error.message || "Check the server configuration and refresh.")}</p></div>`;
});
