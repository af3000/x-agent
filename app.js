// ---- Product catalog ----
const PRODUCTS = [
  { id: "p1", name: "Wireless Headphones", emoji: "🎧", price: 79.99, desc: "Over-ear, noise-cancelling, 30h battery." },
  { id: "p2", name: "Coffee Mug", emoji: "☕", price: 12.5, desc: "Ceramic 350ml mug, keeps drinks warm." },
  { id: "p3", name: "Sneakers", emoji: "👟", price: 64.0, desc: "Lightweight everyday running shoes." },
];

// ---- State ----
const cart = new Map(); // id -> quantity

// ---- Helpers ----
const money = (n) => "$" + n.toFixed(2);
const $ = (sel) => document.querySelector(sel);
const productById = (id) => PRODUCTS.find((p) => p.id === id);

function cartTotal() {
  let total = 0;
  for (const [id, qty] of cart) total += productById(id).price * qty;
  return total;
}

function cartCount() {
  let n = 0;
  for (const qty of cart.values()) n += qty;
  return n;
}

// ---- Rendering ----
function renderProducts() {
  $("#products").innerHTML = PRODUCTS.map((p) => `
    <article class="product-card">
      <div class="product-emoji">${p.emoji}</div>
      <div class="product-body">
        <h3 class="product-name">${p.name}</h3>
        <p class="product-desc">${p.desc}</p>
        <span class="product-price">${money(p.price)}</span>
        <button class="btn btn-primary" data-add="${p.id}">Add to cart</button>
      </div>
    </article>
  `).join("");
}

function renderCart() {
  const list = $("#cart-items");
  if (cart.size === 0) {
    list.innerHTML = `<li class="cart-empty">Your cart is empty.</li>`;
  } else {
    list.innerHTML = [...cart.entries()].map(([id, qty]) => {
      const p = productById(id);
      return `
        <li class="cart-item">
          <span class="cart-item-emoji">${p.emoji}</span>
          <div class="cart-item-info">
            <div class="cart-item-name">${p.name}</div>
            <div class="cart-item-price">${money(p.price)} each</div>
          </div>
          <div class="qty">
            <button data-dec="${id}" aria-label="Decrease quantity">−</button>
            <span>${qty}</span>
            <button data-inc="${id}" aria-label="Increase quantity">+</button>
          </div>
        </li>`;
    }).join("");
  }

  $("#cart-total").textContent = money(cartTotal());
  $("#cart-count").textContent = cartCount();
  $("#checkout-btn").disabled = cart.size === 0;
}

// ---- Cart actions ----
function addToCart(id) {
  cart.set(id, (cart.get(id) || 0) + 1);
  renderCart();
  openCart();
}

function changeQty(id, delta) {
  const next = (cart.get(id) || 0) + delta;
  if (next <= 0) cart.delete(id);
  else cart.set(id, next);
  renderCart();
}

// ---- Cart drawer ----
function openCart() {
  $("#cart").classList.add("open");
  $("#cart").setAttribute("aria-hidden", "false");
  $("#overlay").hidden = false;
}
function closeCart() {
  $("#cart").classList.remove("open");
  $("#cart").setAttribute("aria-hidden", "true");
  $("#overlay").hidden = true;
}

// ---- Checkout ----
function openCheckout() {
  if (cart.size === 0) return;
  renderOrderSummary();
  $("#payment-form").reset();
  $("#payment-form").hidden = false;
  $("#confirmation").hidden = true;
  $("#checkout-modal").hidden = false;
  closeCart();
}
function closeCheckout() {
  $("#checkout-modal").hidden = true;
}

function renderOrderSummary() {
  const lines = [...cart.entries()].map(([id, qty]) => {
    const p = productById(id);
    return `<div class="line"><span>${p.name} × ${qty}</span><span>${money(p.price * qty)}</span></div>`;
  }).join("");
  const total = cartTotal();
  $("#order-summary").innerHTML = lines +
    `<div class="line total"><span>Total</span><span>${money(total)}</span></div>`;
  $("#pay-amount").textContent = money(total);
}

// ---- Payment validation ----
function validatePayment(form) {
  let ok = true;
  const fields = form.querySelectorAll("input[required]");
  fields.forEach((input) => {
    let valid = input.value.trim() !== "";
    if (input.name === "email") valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value);
    if (input.name === "card") valid = input.value.replace(/\s/g, "").length >= 13;
    if (input.name === "expiry") valid = /^\d{2}\/\d{2}$/.test(input.value);
    if (input.name === "cvc") valid = /^\d{3,4}$/.test(input.value);
    input.classList.toggle("invalid", !valid);
    if (!valid) ok = false;
  });
  return ok;
}

function completeOrder(form) {
  const name = form.elements.name.value.trim();
  const total = cartTotal();
  const orderId = "MS-" + Math.random().toString(36).slice(2, 8).toUpperCase();

  $("#payment-form").hidden = true;
  $("#confirmation").hidden = false;
  $("#confirmation-text").textContent =
    `Order ${orderId} confirmed. We've charged ${money(total)} and sent a receipt to ${form.elements.email.value.trim()}. Thanks, ${name.split(" ")[0] || "friend"}!`;

  cart.clear();
  renderCart();
}

// ---- Input formatting ----
function formatCardInput(e) {
  let v = e.target.value.replace(/\D/g, "").slice(0, 16);
  e.target.value = v.replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiryInput(e) {
  let v = e.target.value.replace(/\D/g, "").slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
  e.target.value = v;
}

// ---- Wire up events ----
function init() {
  renderProducts();
  renderCart();

  $("#products").addEventListener("click", (e) => {
    const id = e.target.dataset.add;
    if (id) addToCart(id);
  });

  $("#cart-items").addEventListener("click", (e) => {
    if (e.target.dataset.inc) changeQty(e.target.dataset.inc, 1);
    if (e.target.dataset.dec) changeQty(e.target.dataset.dec, -1);
  });

  $("#cart-toggle").addEventListener("click", openCart);
  $("#cart-close").addEventListener("click", closeCart);
  $("#overlay").addEventListener("click", closeCart);
  $("#checkout-btn").addEventListener("click", openCheckout);
  $("#checkout-close").addEventListener("click", closeCheckout);
  $("#confirmation-close").addEventListener("click", closeCheckout);

  $("input[name=card]").addEventListener("input", formatCardInput);
  $("input[name=expiry]").addEventListener("input", formatExpiryInput);

  $("#payment-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validatePayment(e.target)) return;
    completeOrder(e.target);
  });
}

document.addEventListener("DOMContentLoaded", init);
