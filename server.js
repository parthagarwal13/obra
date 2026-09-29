const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
// Set DATA_DIR and UPLOAD_DIR to persistent-volume paths when deploying.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "shop-data.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const defaultData = {
  admins: [],
  categories: [],
  products: [],
  nextIds: { admin: 1, category: 1, product: 1 }
};

function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  data.admins ||= [];
  data.categories ||= [];
  data.products ||= [];
  data.nextIds ||= { admin: 1, category: 1, product: 1 };
  return data;
}

let db = loadData();

function saveData() {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tempFile, DB_FILE);
}

function nextId(type) {
  const id = db.nextIds[type]++;
  saveData();
  return id;
}

function now() {
  return new Date().toISOString();
}

if (!db.admins.length) {
  db.admins.push({
    id: nextId("admin"),
    username: "admin",
    password: bcrypt.hashSync("admin123", 10),
    created_at: now()
  });
}

if (!db.categories.length) {
  const seed = [
    ["Cookware", "Kadhai, cooker, pans and cooking essentials", "🍳"],
    ["Dinnerware", "Plates, bowls, katoris and serving items", "🍽️"],
    ["Glass & Cups", "Glass, cup, mug and drinkware collection", "🥛"],
    ["Buckets & Household", "Buckets, tubs and household utility items", "🪣"],
    ["Kitchen Essentials", "Everyday kitchen and household essentials", "🏠"]
  ];
  seed.forEach(([name, description, icon]) => {
    db.categories.push({
      id: nextId("category"), name, description, icon, created_at: now()
    });
  });
}
saveData();

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = path.basename(file.originalname, ext)
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase().slice(0, 50);
    cb(null, `${Date.now()}-${safe || "product"}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok = allowed.test(file.mimetype) &&
               allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Only image files are allowed."), ok);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "obra-utensils-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(ROOT, "public")));

function auth(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function deleteImage(imagePath) {
  if (!imagePath) return;
  const filename = path.basename(imagePath);
  const full = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

function categoryById(id) {
  return db.categories.find(c => c.id === Number(id));
}

function productView(p) {
  const c = categoryById(p.category_id);
  return {
    ...p,
    category_name: c?.name || "Uncategorized",
    category_icon: c?.icon || "🍽️"
  };
}

app.get("/api/store", (req, res) => {
  const categories = [...db.categories].sort((a,b) => a.name.localeCompare(b.name));
  const products = db.products
    .filter(p => p.visible === 1)
    .sort((a,b) => (b.featured-a.featured) || b.created_at.localeCompare(a.created_at))
    .map(productView);

  res.json({
    shop: {
      name: "Obra Utensils & Household",
      location: "Obra, Sonbhadra, Uttar Pradesh",
      phone: "+91 00000 00000",
      tagline: "Quality utensils for every home"
    },
    categories,
    products
  });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const admin = db.admins.find(a => a.username === username);
  if (!admin || !bcrypt.compareSync(password || "", admin.password)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  req.session.adminId = admin.id;
  req.session.username = admin.username;
  res.json({ success: true, username: admin.username });
});

app.post("/api/admin/logout", auth, (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session.adminId) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, username: req.session.username });
});

app.get("/api/admin/dashboard", auth, (req, res) => {
  res.json({
    products: db.products.length,
    categories: db.categories.length,
    visible: db.products.filter(p => p.visible === 1).length,
    featured: db.products.filter(p => p.featured === 1).length
  });
});

app.get("/api/admin/categories", auth, (req, res) => {
  res.json([...db.categories].sort((a,b) => a.name.localeCompare(b.name)));
});

app.post("/api/admin/categories", auth, (req, res) => {
  const { name, description, icon } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Category name is required" });
  if (db.categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: "Category already exists" });
  }
  const category = {
    id: nextId("category"),
    name: name.trim(),
    description: description || "",
    icon: icon || "🍽️",
    created_at: now()
  };
  db.categories.push(category);
  saveData();
  res.json({ id: category.id });
});

app.put("/api/admin/categories/:id", auth, (req, res) => {
  const c = categoryById(req.params.id);
  if (!c) return res.status(404).json({ error: "Category not found" });
  if (!req.body.name?.trim()) return res.status(400).json({ error: "Category name is required" });
  c.name = req.body.name.trim();
  c.description = req.body.description || "";
  c.icon = req.body.icon || "🍽️";
  saveData();
  res.json({ success: true });
});

app.delete("/api/admin/categories/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const c = categoryById(id);
  if (!c) return res.status(404).json({ error: "Category not found" });

  db.products.filter(p => p.category_id === id).forEach(p => deleteImage(p.image));
  db.products = db.products.filter(p => p.category_id !== id);
  db.categories = db.categories.filter(c => c.id !== id);
  saveData();
  res.json({ success: true });
});

app.get("/api/admin/products", auth, (req, res) => {
  res.json(
    [...db.products]
      .sort((a,b) => b.created_at.localeCompare(a.created_at))
      .map(productView)
  );
});

app.post("/api/admin/products", auth, upload.single("image"), (req, res) => {
  const { category_id, name, description, price, unit, stock_status, featured, visible } = req.body;
  if (!category_id || !name?.trim()) {
    if (req.file) deleteImage(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error: "Category and product name are required" });
  }
  if (!categoryById(category_id)) {
    if (req.file) deleteImage(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error: "Invalid category" });
  }

  const product = {
    id: nextId("product"),
    category_id: Number(category_id),
    name: name.trim(),
    description: description || "",
    price: Number(price) || 0,
    unit: unit || "piece",
    image: req.file ? `/uploads/${req.file.filename}` : "",
    stock_status: stock_status || "In Stock",
    featured: featured === "1" ? 1 : 0,
    visible: visible === "0" ? 0 : 1,
    created_at: now()
  };
  db.products.push(product);
  saveData();
  res.json({ id: product.id });
});

app.put("/api/admin/products/:id", auth, upload.single("image"), (req, res) => {
  const p = db.products.find(x => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: "Product not found" });

  if (!categoryById(req.body.category_id)) {
    if (req.file) deleteImage(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error: "Invalid category" });
  }

  const oldImage = p.image;
  p.category_id = Number(req.body.category_id);
  p.name = (req.body.name || "").trim();
  p.description = req.body.description || "";
  p.price = Number(req.body.price) || 0;
  p.unit = req.body.unit || "piece";
  p.image = req.file ? `/uploads/${req.file.filename}` : oldImage;
  p.stock_status = req.body.stock_status || "In Stock";
  p.featured = req.body.featured === "1" ? 1 : 0;
  p.visible = req.body.visible === "0" ? 0 : 1;

  if (req.file && oldImage) deleteImage(oldImage);
  saveData();
  res.json({ success: true });
});

app.delete("/api/admin/products/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const index = db.products.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: "Product not found" });
  deleteImage(db.products[index].image);
  db.products.splice(index, 1);
  saveData();
  res.json({ success: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Something went wrong" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Obra Utensils Shop running at http://localhost:${PORT}`);
});
