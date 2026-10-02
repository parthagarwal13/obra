const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");
const { serialize, parse } = require("cookie");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

let sql = global._obraNeon;
function getDb() {
  if (sql) return sql;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  sql = neon(process.env.DATABASE_URL);
  global._obraNeon = sql;
  return sql;
}

const COOKIE_NAME = "obra_admin";
const DEFAULT_CATEGORIES = [
  ["Cookware", "Kadhai, cooker, pans and cooking essentials", "\uD83C\uDF73"],
  ["Dinnerware", "Plates, bowls, katoris and serving items", "\uD83C\uDF7D\uFE0F"],
  ["Glass & Cups", "Glass, cup, mug and drinkware collection", "\uD83E\uDD5B"],
  ["Buckets & Household", "Buckets, tubs and household utility items", "\uD83E\uDEE3"],
  ["Kitchen Essentials", "Everyday kitchen and household essentials", "\uD83C\uDFE0"]
];

function jwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return process.env.JWT_SECRET;
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validId(id) {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, jwtSecret(), { expiresIn: "8h" });
}

function setAuthCookie(res, token) {
  res.setHeader("Set-Cookie", serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8
  }));
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", serialize(COOKIE_NAME, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0
  }));
}

function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ error: "JWT_SECRET must be configured with at least 32 characters" });
  }
  try {
    const token = parse(req.headers.cookie || "")[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    req.user = jwt.verify(token, jwtSecret());
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

let initPromise;
async function initDb() {
  const db = getDb();
  if (!initPromise) {
    initPromise = (async () => {
      await db`CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await db`CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '🍽️',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await db`CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'piece',
        image TEXT NOT NULL DEFAULT '',
        stock_status TEXT NOT NULL DEFAULT 'In Stock',
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      for (const [name, description, icon] of DEFAULT_CATEGORIES) {
        await db`INSERT INTO categories (name, description, icon)
          VALUES (${name}, ${description}, ${icon}) ON CONFLICT (name) DO NOTHING`;
      }

      const username = process.env.ADMIN_USERNAME || "admin";
      const password = process.env.ADMIN_PASSWORD;
      if (password) {
        const existing = await db`SELECT id FROM admins WHERE username = ${username} LIMIT 1`;
        if (!existing.length) {
          await db`INSERT INTO admins (username, password)
            VALUES (${username}, ${await bcrypt.hash(password, 12)}) ON CONFLICT (username) DO NOTHING`;
        }
      }
    })().catch(error => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
  return db;
}

function databaseError(error) {
  console.error(error);
  if (error.message === "DATABASE_URL is not configured") {
    return "DATABASE_URL is missing. Add your Neon connection string to .env.";
  }
  if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
    return "Cannot reach Neon. Check DATABASE_URL and your network connection.";
  }
  return "Neon database request failed. Check DATABASE_URL and the database status in Neon.";
}

app.get("/api/store", asyncHandler(async (req, res) => {
  try {
    const db = await initDb();
    const [categories, products] = await Promise.all([
      db`SELECT id, name, description, icon, created_at FROM categories ORDER BY name ASC`,
      db`SELECT p.id, p.category_id, p.name, p.description, p.price, p.unit, p.image,
                p.stock_status, p.featured, p.visible, p.created_at,
                COALESCE(c.name, 'Uncategorized') AS category_name,
                COALESCE(c.icon, '🍽️') AS category_icon
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.visible = TRUE ORDER BY p.featured DESC, p.created_at DESC`
    ]);
    res.json({
      shop: {
        name: "MAI Ram JAI BHAGAWAN",
        location: "Obra, Sonbhadra, Uttar Pradesh",
        phone: "+91 00000 00000",
        tagline: "Quality utensils for every home"
      },
      categories,
      products: products.map(p => ({ ...p, id: String(p.id), category_id: p.category_id ? String(p.category_id) : "" }))
    });
  } catch (error) {
    res.status(500).json({ error: databaseError(error) });
  }
}));

app.post("/api/admin/login", asyncHandler(async (req, res) => {
  try {
    const db = await initDb();
    const { username, password } = req.body;
    const [admin] = await db`SELECT id, username, password FROM admins WHERE username = ${username || ""} LIMIT 1`;
    if (!admin || !await bcrypt.compare(password || "", admin.password)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    setAuthCookie(res, issueToken(admin));
    res.json({ success: true, username: admin.username });
  } catch (error) {
    res.status(500).json({ error: error.message.includes("JWT_SECRET") ? error.message : databaseError(error) });
  }
}));

app.post("/api/admin/logout", requireAuth, (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

app.get("/api/admin/me", requireAuth, (req, res) => {
  res.json({ authenticated: true, username: req.user.username });
});

app.get("/api/admin/dashboard", requireAuth, asyncHandler(async (req, res) => {
  const db = await initDb();
  const [row] = await db`SELECT
    (SELECT COUNT(*)::int FROM products) AS products,
    (SELECT COUNT(*)::int FROM categories) AS categories,
    (SELECT COUNT(*)::int FROM products WHERE visible = TRUE) AS visible,
    (SELECT COUNT(*)::int FROM products WHERE featured = TRUE) AS featured`;
  res.json(row);
}));

app.get("/api/admin/categories", requireAuth, asyncHandler(async (req, res) => {
  const db = await initDb();
  res.json(await db`SELECT id, name, description, icon, created_at FROM categories ORDER BY name ASC`);
}));

app.post("/api/admin/categories", requireAuth, asyncHandler(async (req, res) => {
  const db = await initDb();
  const { name, description, icon } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Category name is required" });
  try {
    const [category] = await db`INSERT INTO categories (name, description, icon)
      VALUES (${name.trim()}, ${description || ""}, ${icon || "🍽️"}) RETURNING id`;
    res.json({ id: String(category.id) });
  } catch (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Category already exists" });
    throw error;
  }
}));

app.put("/api/admin/categories/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid category id" });
  const db = await initDb();
  const { name, description, icon } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Category name is required" });
  try {
    const rows = await db`UPDATE categories SET name = ${name.trim()}, description = ${description || ""},
      icon = ${icon || "🍽️"} WHERE id = ${req.params.id} RETURNING id`;
    if (!rows.length) return res.status(404).json({ error: "Category not found" });
    res.json({ success: true });
  } catch (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Category already exists" });
    throw error;
  }
}));

app.delete("/api/admin/categories/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid category id" });
  const db = await initDb();
  await db`DELETE FROM categories WHERE id = ${req.params.id}`;
  res.json({ success: true });
}));

app.get("/api/admin/products", requireAuth, asyncHandler(async (req, res) => {
  const db = await initDb();
  const products = await db`SELECT p.id, p.category_id, p.name, p.description, p.price, p.unit, p.image,
      p.stock_status, p.featured, p.visible, p.created_at,
      COALESCE(c.name, 'Uncategorized') AS category_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC`;
  res.json(products.map(p => ({ ...p, id: String(p.id), category_id: p.category_id ? String(p.category_id) : "" })));
}));

app.post("/api/admin/products", requireAuth, asyncHandler(async (req, res) => {
  const db = await initDb();
  const { category_id, name, description, price, unit, image, stock_status, featured, visible } = req.body;
  if (!validId(category_id) || !name?.trim()) {
    return res.status(400).json({ error: "Category and product name are required" });
  }
  const [product] = await db`INSERT INTO products
    (category_id, name, description, price, unit, image, stock_status, featured, visible)
    VALUES (${category_id}, ${name.trim()}, ${description || ""}, ${Number(price) || 0}, ${unit || "piece"},
      ${image || ""}, ${stock_status || "In Stock"}, ${featured === "1" || featured === true},
      ${visible !== "0" && visible !== false}) RETURNING id`;
  res.json({ id: String(product.id) });
}));

app.put("/api/admin/products/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid product id" });
  const db = await initDb();
  const { category_id, name, description, price, unit, image, stock_status, featured, visible } = req.body;
  if (!validId(category_id) || !name?.trim()) {
    return res.status(400).json({ error: "Category and product name are required" });
  }
  const rows = image === undefined
    ? await db`UPDATE products SET category_id = ${category_id}, name = ${name.trim()},
        description = ${description || ""}, price = ${Number(price) || 0}, unit = ${unit || "piece"},
        stock_status = ${stock_status || "In Stock"}, featured = ${featured === "1" || featured === true},
        visible = ${visible !== "0" && visible !== false} WHERE id = ${req.params.id} RETURNING id`
    : await db`UPDATE products SET category_id = ${category_id}, name = ${name.trim()},
        description = ${description || ""}, price = ${Number(price) || 0}, unit = ${unit || "piece"},
        image = ${image}, stock_status = ${stock_status || "In Stock"},
        featured = ${featured === "1" || featured === true}, visible = ${visible !== "0" && visible !== false}
        WHERE id = ${req.params.id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ error: "Product not found" });
  res.json({ success: true });
}));

app.delete("/api/admin/products/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid product id" });
  const db = await initDb();
  await db`DELETE FROM products WHERE id = ${req.params.id}`;
  res.json({ success: true });
}));

app.get("/api/admin/cloudinary-signature", requireAuth, (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({ error: "Cloudinary environment variables are not configured" });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "obra-utensils";
  const signature = crypto.createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");
  res.json({ cloudName, apiKey, timestamp, folder, signature });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.code === "23503") return res.status(400).json({ error: "Selected category does not exist" });
  res.status(500).json({ error: process.env.NODE_ENV === "development" ? err.message : "Server error" });
});

module.exports = app;
