
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
// Image upload configuration
const uploadDir = path.join(__dirname, "public", "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const allowedImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const extension = allowedImageTypes[file.mimetype];
    cb(null, `food-${Date.now()}-${Math.round(Math.random() * 1000000)}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedImageTypes[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, WEBP, or GIF images are allowed"));
    }
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "foodiehub",
  waitForConnections: true,
  connectionLimit: 10
});

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("Set a JWT_SECRET of at least 32 characters in .env");
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Please log in first" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    req.user = user;
    next();
  });
}

// Admin middleware
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
}

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ message: "FoodieHub API and database are running" });
  } catch (error) {
    res.status(500).json({ message: "Database connection failed" });
  }
});

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (existing.length) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name.trim(), normalizedEmail, hashedPassword]
    );

    res.status(201).json({
      message: "Registration successful",
      userId: result.insertId
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email, password, role FROM users WHERE email = ?",
      [email.trim().toLowerCase()]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

// Get menu
app.get("/api/menu", async (req, res) => {
  try {
    const [items] = await pool.execute(
      "SELECT * FROM menu_items WHERE available = TRUE ORDER BY id DESC"
    );

    res.json(items);
  } catch (error) {
    console.error("Menu error:", error);
    res.status(500).json({ message: "Could not load menu" });
  }
});

// Get current user
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, email, role FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Could not load user" });
  }
});

// Place order
app.post("/api/orders", authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { items, delivery_address } = req.body;

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      !delivery_address ||
      !delivery_address.trim()
    ) {
      return res.status(400).json({
        message: "Order items and delivery address are required"
      });
    }

    await connection.beginTransaction();

    let total = 0;
    const verifiedItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        throw new Error("Invalid item quantity");
      }

      const [rows] = await connection.execute(
        "SELECT id, price FROM menu_items WHERE id = ? AND available = TRUE",
        [item.menu_item_id]
      );

      if (!rows.length) {
        throw new Error("A selected menu item is unavailable");
      }

      const price = Number(rows[0].price);
      total += price * quantity;

      verifiedItems.push({
        id: rows[0].id,
        price,
        quantity
      });
    }

    const [order] = await connection.execute(
      "INSERT INTO orders (user_id, total_amount, delivery_address) VALUES (?, ?, ?)",
      [req.user.id, total, delivery_address.trim()]
    );

    for (const item of verifiedItems) {
      await connection.execute(
        "INSERT INTO order_items (order_id, menu_item_id, quantity, price) VALUES (?, ?, ?, ?)",
        [order.insertId, item.id, item.quantity, item.price]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: "Order placed successfully",
      orderId: order.insertId,
      total
    });
  } catch (error) {
    await connection.rollback();
    console.error("Order error:", error);
    res.status(400).json({ message: error.message || "Could not place order" });
  } finally {
    connection.release();
  }
});

// Customer order history
app.get("/api/orders", authenticateToken, async (req, res) => {
  try {
    const [orders] = await pool.execute(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Could not load orders" });
  }
});

// Admin: add menu item
app.post(
  "/api/admin/menu",
  authenticateToken,
  adminOnly,
  upload.single("imageFile"),
  async (req, res) => {
    try {
      const { name, description, price, image, category } = req.body;
      const imagePath = req.file
  ? `/uploads/${req.file.filename}`
  : (image || "");
      const amount = Number(price);

      if (
        !name ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 100000
      ) {
        return res.status(400).json({ message: "Valid name and price required" });
      }

      const [result] = await pool.execute(
        "INSERT INTO menu_items (name, description, price, image, category) VALUES (?, ?, ?, ?, ?)",
        [
          name.trim(),
          description || "",
          amount,
          imagePath,
          category || "Other"
        ]
      );

      res.status(201).json({
        message: "Menu item added",
        id: result.insertId
      });
    } catch (error) {
      console.error("Admin menu error:", error);
      res.status(500).json({ message: "Could not add menu item" });
    }
  }
);

// Admin: remove menu item without deleting order history
app.delete(
  "/api/admin/menu/:id",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    const menuItemId = Number(req.params.id);

    if (!Number.isSafeInteger(menuItemId) || menuItemId < 1) {
      return res.status(400).json({ message: "Invalid menu item ID" });
    }

    try {
      const [result] = await pool.execute(
        "UPDATE menu_items SET available = FALSE WHERE id = ? AND available = TRUE",
        [menuItemId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      res.json({ message: "Menu item removed" });
    } catch (error) {
      console.error("Admin menu removal error:", error);
      res.status(500).json({ message: "Could not remove menu item" });
    }
  }
);

// Admin: view all orders
app.get(
  "/api/admin/orders",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    try {
      const [orders] = await pool.execute(
        `SELECT orders.*, users.name AS customer_name, users.email
         FROM orders
         JOIN users ON orders.user_id = users.id
         ORDER BY orders.created_at DESC`
      );

      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Could not load admin orders" });
    }
  }
);

// Admin: update order status
app.patch(
  "/api/admin/orders/:id/status",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    try {
      const allowedStatuses = [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled"
      ];

      const { status } = req.body;

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid order status" });
      }

      const [result] = await pool.execute(
        "UPDATE orders SET status = ? WHERE id = ?",
        [status, req.params.id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json({ message: "Order status updated" });
    } catch (error) {
      res.status(500).json({ message: "Could not update order" });
    }
  }
);

// Start server
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("MySQL connected successfully");

    app.listen(PORT, () => {
      console.log(`FoodieHub running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not connect to MySQL:", error.message);
    process.exit(1);
  }
}

startServer();
