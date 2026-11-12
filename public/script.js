
const API = "/api";

let menuItems = [];
let cart = [];
let token = localStorage.getItem("foodiehub_token") || "";
let currentUser = null;
let authMode = "login";
let loginRole = "customer";

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (token) headers.Authorization = `Bearer ${token}`;

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(API + url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong");
  }

  return data;
}

function showMessage(id, message) {
  $(id).textContent = message;
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function clearAuthErrors() {
  $("emailError").textContent = "";
  $("passwordError").textContent = "";
}

function openModal(id) {
  $(id).classList.remove("hidden");
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

// Authentication dialog
$("loginButton").addEventListener("click", () => {
  authMode = "login";
  loginRole = "customer";
  updateAuthForm();
  openModal("authModal");
});

$("closeAuth").addEventListener("click", () => closeModal("authModal"));
$("closeCart").addEventListener("click", () => closeModal("cartModal"));

$("customerTab").addEventListener("click", () => {
  loginRole = "customer";
  authMode = "login";
  updateAuthForm();
});

$("adminTab").addEventListener("click", () => {
  loginRole = "admin";
  authMode = "login";
  updateAuthForm();
});

$("registerButton").addEventListener("click", () => {
  authMode = "register";
  loginRole = "customer";
  updateAuthForm();
});

function updateAuthForm() {
  $("customerTab").classList.toggle("active", loginRole === "customer");
  $("adminTab").classList.toggle("active", loginRole === "admin");

  $("nameInput").classList.toggle("hidden", authMode !== "register");
  $("registerPrompt").classList.toggle("hidden", loginRole === "admin");

  $("authTitle").textContent =
    loginRole === "admin" ? "Admin Login" :
    authMode === "register" ? "Create Customer Account" :
    "Customer Login";

  $("authSubmit").textContent =
    authMode === "register" ? "Create Account" : "Login";

  $("authMessage").textContent = "";
  clearAuthErrors();
  $("authForm").reset();
}


$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  clearAuthErrors();
  showMessage("authMessage", "");

  const name = $("nameInput").value.trim();
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  // Email validation
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!emailValid) {
    showMessage("emailError", "Please enter a valid email address");
    return;
  }

  // Password validation
  if (password.length < 6) {
    showMessage("passwordError", "Password must be at least 6 characters");
    return;
  }

  try {
    if (authMode === "register") {
      await api("/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });

      authMode = "login";
      updateAuthForm();
      showMessage("authMessage", "Account created! Please log in.");
      return;
    }

    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (loginRole === "admin" && data.user.role !== "admin") {
      throw new Error("This account does not have admin access.");
    }

    if (loginRole === "customer" && data.user.role !== "customer") {
      throw new Error("Please use Admin Login for this account.");
    }

    token = data.token;
    currentUser = data.user;

    localStorage.setItem("foodiehub_token", token);

    closeModal("authModal");
    updateUserInterface();
    await loadOrders();

    if (currentUser.role === "admin") {
      await loadAdminOrders();
    }
  } catch (error) {
    showMessage("authMessage", error.message);
  }
});


// User interface
function updateUserInterface() {
  const loggedIn = Boolean(currentUser);

  $("loginButton").classList.toggle("hidden", loggedIn);
  $("logoutButton").classList.toggle("hidden", !loggedIn);
  $("adminSection").classList.toggle(
    "hidden",
    !loggedIn || currentUser.role !== "admin"
  );
  renderFilteredMenu();

  if (loggedIn && currentUser.role === "admin") {
    $("orders").classList.add("hidden");
  } else {
    $("orders").classList.remove("hidden");
  }
}

$("logoutButton").addEventListener("click", () => {
  token = "";
  currentUser = null;
  localStorage.removeItem("foodiehub_token");
  updateUserInterface();
  $("ordersList").innerHTML = "<p>Log in to see your orders.</p>";
  $("adminOrders").innerHTML = "";
});

// Menu
async function loadMenu() {
  try {
    menuItems = await api("/menu");
    renderFilteredMenu();
  } catch (error) {
    $("menuGrid").innerHTML =
      `<p>Could not load menu. Check that the backend and database are running.</p>`;
  }
}

function renderFilteredMenu() {
  const search = $("searchInput").value.toLowerCase();

  renderMenu(menuItems.filter(item =>
    item.name.toLowerCase().includes(search) ||
    (item.category || "").toLowerCase().includes(search)
  ));
}

function renderMenu(items) {
  if (!items.length) {
    $("menuGrid").innerHTML = "<p>No food items available yet.</p>";
    return;
  }

  $("menuGrid").innerHTML = items.map(item => `
    <article class="food-card">
      ${
        item.image
          ? `<img class="food-image" src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}" onerror="this.style.display='none'">`
          : `<div class="food-placeholder">🍽️</div>`
      }
      <div class="food-info">
        <h3>${escapeHTML(item.name)}</h3>
        <p>${escapeHTML(item.description || item.category || "Fresh and delicious")}</p>
        <div class="food-bottom">
          <span class="price">₹${Number(item.price).toFixed(2)}</span>
          ${currentUser?.role === "admin"
            ? `<button type="button" class="delete-item-btn" onclick="deleteMenuItem(${Number(item.id)})">Delete</button>`
            : `<button type="button" onclick="addToCart(${Number(item.id)})">Add to Cart</button>`}
        </div>
      </div>
    </article>
  `).join("");
}

$("searchInput").addEventListener("input", renderFilteredMenu);

// Cart
function addToCart(id) {
  const item = menuItems.find(food => Number(food.id) === id);
  if (!item) return;

  const existing = cart.find(food => food.id === id);

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...item, quantity: 1 });
  }

  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  renderCart();
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity, 0
  );

  $("cartCount").textContent = count;
  $("cartTotal").textContent = `Total: ₹${total.toFixed(2)}`;

  if (!cart.length) {
    $("cartItems").innerHTML = "<p>Your cart is empty.</p>";
    return;
  }

  $("cartItems").innerHTML = cart.map(item => `
    <div class="cart-row">
      <span>${escapeHTML(item.name)} × ${item.quantity}</span>
      <span>
        ₹${(Number(item.price) * item.quantity).toFixed(2)}
        <button type="button" onclick="removeFromCart(${Number(item.id)})">Remove</button>
      </span>
    </div>
  `).join("");
}

$("cartButton").addEventListener("click", () => {
  renderCart();
  openModal("cartModal");
});

// Checkout
$("checkoutForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    closeModal("cartModal");
    authMode = "login";
    loginRole = "customer";
    updateAuthForm();
    openModal("authModal");
    showMessage("authMessage", "Please log in before placing an order.");
    return;
  }

  if (!cart.length) {
    showMessage("checkoutMessage", "Your cart is empty.");
    return;
  }

  const delivery_address = $("deliveryAddress").value.trim();

  try {
    const data = await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        delivery_address,
        items: cart.map(item => ({
          menu_item_id: item.id,
          quantity: item.quantity
        }))
      })
    });

    cart = [];
    renderCart();
    $("checkoutForm").reset();

    showMessage(
      "checkoutMessage",
      `Order #${data.orderId} placed successfully!`
    );

    await loadOrders();
  } catch (error) {
    showMessage("checkoutMessage", error.message);
  }
});

// Customer order history
async function loadOrders() {
  if (!currentUser || currentUser.role !== "customer") return;

  try {
    const orders = await api("/orders");

    if (!orders.length) {
      $("ordersList").innerHTML = "<p>You haven't placed any orders yet.</p>";
      return;
    }

    $("ordersList").innerHTML = orders.map(order => `
      <div class="order-card">
        <strong>Order #${order.id}</strong>
        <p>Total: ₹${Number(order.total_amount).toFixed(2)}</p>
        <p>Status: ${escapeHTML(order.status)}</p>
        <p>Address: ${escapeHTML(order.delivery_address)}</p>
      </div>
    `).join("");
  } catch (error) {
    $("ordersList").textContent = error.message;
  }
}

// Admin: add menu item
$("addMenuForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || currentUser.role !== "admin") return;

  const form = new FormData(event.target);
  const item = Object.fromEntries(form.entries());
  item.price = Number(item.price);

  try {
    await api("/admin/menu", {
      method: "POST",
      body: JSON.stringify(item)
    });

    event.target.reset();
    alert("Food item added successfully!");
    await loadMenu();
  } catch (error) {
    alert(error.message);
  }
});

async function deleteMenuItem(id) {
  if (!currentUser || currentUser.role !== "admin") return;

  const item = menuItems.find(food => Number(food.id) === id);
  if (!item || !window.confirm(`Remove "${item.name}" from the menu?`)) return;

  try {
    await api(`/admin/menu/${id}`, { method: "DELETE" });
    cart = cart.filter(food => Number(food.id) !== id);
    renderCart();
    await loadMenu();
    showToast("Menu item removed.");
  } catch (error) {
    alert(error.message);
  }
}

// Admin: view and manage orders
async function loadAdminOrders() {
  if (!currentUser || currentUser.role !== "admin") return;

  try {
    const orders = await api("/admin/orders");

    if (!orders.length) {
      $("adminOrders").innerHTML = "<p>No customer orders yet.</p>";
      return;
    }

    const statuses = [
      "pending",
      "confirmed",
      "preparing",
      "out_for_delivery",
      "delivered",
      "cancelled"
    ];

    $("adminOrders").innerHTML = orders.map(order => `
      <div class="order-card">
        <strong>Order #${order.id}</strong>
        <p>Customer: ${escapeHTML(order.customer_name)}</p>
        <p>Email: ${escapeHTML(order.email)}</p>
        <p>Total: ₹${Number(order.total_amount).toFixed(2)}</p>
        <p>Address: ${escapeHTML(order.delivery_address)}</p>
        <label>
          Status:
          <select onchange="updateOrderStatus(${Number(order.id)}, this.value)">
            ${statuses.map(status => `
              <option value="${status}" ${order.status === status ? "selected" : ""}>
                ${status.replaceAll("_", " ")}
              </option>
            `).join("")}
          </select>
        </label>
      </div>
    `).join("");
  } catch (error) {
    $("adminOrders").textContent = error.message;
  }
}

async function updateOrderStatus(id, status) {
  try {
    await api(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    showToast("✓ Order status updated successfully!");
  } catch (error) {
    alert(error.message);
    await loadAdminOrders();
  }
}

// Restore login session after page refresh
async function restoreSession() {
  if (!token) {
    updateUserInterface();
    return;
  }

  try {
    currentUser = await api("/me");
    updateUserInterface();

    if (currentUser.role === "customer") {
      await loadOrders();
    } else {
      await loadAdminOrders();
    }
  } catch (error) {
    token = "";
    currentUser = null;
    localStorage.removeItem("foodiehub_token");
    updateUserInterface();
  }
}

// Start application
renderCart();
loadMenu();
restoreSession();
