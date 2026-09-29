const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");
const { serialize, parse } = require("cookie");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

let cached = global._obraMongo;
async function getDb() {
  if (cached) return cached;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "obra_utensils");
  await db.collection("categories").createIndex({ name: 1 }, { unique: true });
  cached = { client, db };
  global._obraMongo = cached;
  return cached;
}

const COOKIE_NAME = "obra_admin";

function jwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return process.env.JWT_SECRET;
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function categoryView(category) {
  return { ...category, id: String(category._id) };
}

function issueToken(user) {
  return jwt.sign({ sub: String(user._id), username: user.username }, jwtSecret(), { expiresIn: "8h" });
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

async function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ error: "JWT_SECRET must be configured with at least 32 characters" });
  }
  try {
    const cookies = parse(req.headers.cookie || "");
    const token = cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    req.user = jwt.verify(token, jwtSecret());
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

async function ensureAdmin(db) {
  const users = db.collection("admins");
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;
  const exists = await users.findOne({ username });
  if (!exists) {
    await users.insertOne({
      username,
      password: await bcrypt.hash(password, 12),
      created_at: new Date()
    });
  }
}

async function seedCategories(db) {
  const categories = db.collection("categories");
  if (await categories.countDocuments() > 0) return;
  await categories.insertMany([
    { name:"Cookware", description:"Kadhai, cooker, pans and cooking essentials", icon:"\uD83C\uDF73", created_at:new Date() },
    { name:"Dinnerware", description:"Plates, bowls, katoris and serving items", icon:"\uD83C\uDF7D\uFE0F", created_at:new Date() },
    { name:"Glass & Cups", description:"Glass, cup, mug and drinkware collection", icon:"\uD83E\uDD5B", created_at:new Date() },
    { name:"Buckets & Household", description:"Buckets, tubs and household utility items", icon:"\uD83E\uDEE3", created_at:new Date() },
    { name:"Kitchen Essentials", description:"Everyday kitchen and household essentials", icon:"\uD83C\uDFE0", created_at:new Date() }
  ]);
}

async function initDb() {
  const { db } = await getDb();
  await ensureAdmin(db);
  await seedCategories(db);
  return db;
}

function validId(id) {
  return ObjectId.isValid(id);
}

app.get("/api/store", asyncHandler(async (req, res) => {
  try {
    const db = await initDb();
    const categories = await db.collection("categories").find({}).sort({name:1}).toArray();
    const products = await db.collection("products")
      .find({visible:true})
      .sort({featured:-1, created_at:-1})
      .toArray();

    const catMap = Object.fromEntries(categories.map(c => [String(c._id), c]));
    res.json({
      shop: {
        name:"Obra Utensils & Household",
        location:"Obra, Sonbhadra, Uttar Pradesh",
        phone:"+91 00000 00000",
        tagline:"Quality utensils for every home"
      },
      categories: categories.map(categoryView),
      products: products.map(p => ({
        ...p,
        id:String(p._id),
        category_id:String(p.category_id),
        category_name:catMap[String(p.category_id)]?.name || "Uncategorized",
        category_icon:catMap[String(p.category_id)]?.icon || "\uD83C\uDF7D\uFE0F"
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Database error"});
  }
}));

app.post("/api/admin/login", asyncHandler(async (req,res) => {
  try {
    const db=await initDb();
    const {username,password}=req.body;
    const admin=await db.collection("admins").findOne({username});
    if(!admin || !await bcrypt.compare(password||"",admin.password))
      return res.status(401).json({error:"Invalid username or password"});
    setAuthCookie(res,issueToken(admin));
    res.json({success:true,username:admin.username});
  } catch(e) { console.error(e); res.status(500).json({error:e.message.includes("JWT_SECRET") ? e.message : "Login failed"}); }
}));

app.post("/api/admin/logout", requireAuth, (req,res)=>{
  clearAuthCookie(res);
  res.json({success:true});
});

app.get("/api/admin/me", requireAuth, (req,res)=>{
  res.json({authenticated:true,username:req.user.username});
});

app.get("/api/admin/dashboard", requireAuth, asyncHandler(async (req,res)=>{
  const db=await initDb();
  const [products,categories,visible,featured]=await Promise.all([
    db.collection("products").countDocuments(),
    db.collection("categories").countDocuments(),
    db.collection("products").countDocuments({visible:true}),
    db.collection("products").countDocuments({featured:true})
  ]);
  res.json({products,categories,visible,featured});
}));

app.get("/api/admin/categories", requireAuth, asyncHandler(async (req,res)=>{
  const db=await initDb();
  const categories=await db.collection("categories").find({}).sort({name:1}).toArray();
  res.json(categories.map(categoryView));
}));

app.post("/api/admin/categories", requireAuth, asyncHandler(async (req,res)=>{
  const db=await initDb();
  const {name,description,icon}=req.body;
  if(!name?.trim()) return res.status(400).json({error:"Category name is required"});
  try {
    const result=await db.collection("categories").insertOne({
      name:name.trim(),description:description||"",icon:icon||"\uD83C\uDF7D\uFE0F",created_at:new Date()
    });
    res.json({id:String(result.insertedId)});
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({error:"Category already exists"});
    throw error;
  }
}));

app.put("/api/admin/categories/:id", requireAuth, asyncHandler(async (req,res)=>{
  if(!validId(req.params.id)) return res.status(400).json({error:"Invalid category id"});
  const db=await initDb();
  const {name,description,icon}=req.body;
  if(!name?.trim()) return res.status(400).json({error:"Category name is required"});
  const result=await db.collection("categories").updateOne(
    {_id:new ObjectId(req.params.id)},
    {$set:{name:name.trim(),description:description||"",icon:icon||"\uD83C\uDF7D\uFE0F"}}
  );
  if(!result.matchedCount) return res.status(404).json({error:"Category not found"});
  res.json({success:true});
}));

app.delete("/api/admin/categories/:id", requireAuth, asyncHandler(async (req,res)=>{
  if(!validId(req.params.id)) return res.status(400).json({error:"Invalid category id"});
  const db=await initDb();
  const categoryId=new ObjectId(req.params.id);
  await db.collection("products").deleteMany({category_id:categoryId});
  await db.collection("categories").deleteOne({_id:categoryId});
  res.json({success:true});
}));

app.get("/api/admin/products", requireAuth, asyncHandler(async (req,res)=>{
  const db=await initDb();
  const [products,categories]=await Promise.all([
    db.collection("products").find({}).sort({created_at:-1}).toArray(),
    db.collection("categories").find({}).toArray()
  ]);
  const map=Object.fromEntries(categories.map(c=>[String(c._id),c]));
  res.json(products.map(p=>({
    ...p,id:String(p._id),category_id:String(p.category_id),
    category_name:map[String(p.category_id)]?.name||"Uncategorized"
  })));
}));

app.post("/api/admin/products", requireAuth, asyncHandler(async (req,res)=>{
  const db=await initDb();
  const {category_id,name,description,price,unit,image,stock_status,featured,visible}=req.body;
  if(!validId(category_id)||!name?.trim())
    return res.status(400).json({error:"Category and product name are required"});
  const category=await db.collection("categories").findOne({_id:new ObjectId(category_id)});
  if(!category) return res.status(400).json({error:"Invalid category"});
  const result=await db.collection("products").insertOne({
    category_id:new ObjectId(category_id),
    name:name.trim(),description:description||"",price:Number(price)||0,
    unit:unit||"piece",image:image||"",stock_status:stock_status||"In Stock",
    featured:featured==="1"||featured===true,visible:visible!=="0"&&visible!==false,
    created_at:new Date()
  });
  res.json({id:String(result.insertedId)});
}));

app.put("/api/admin/products/:id", requireAuth, asyncHandler(async (req,res)=>{
  if(!validId(req.params.id)) return res.status(400).json({error:"Invalid product id"});
  const db=await initDb();
  const {category_id,name,description,price,unit,image,stock_status,featured,visible}=req.body;
  if(!validId(category_id)||!name?.trim()) return res.status(400).json({error:"Category and product name are required"});
  const update={
    category_id:new ObjectId(category_id),name:name.trim(),description:description||"",
    price:Number(price)||0,unit:unit||"piece",stock_status:stock_status||"In Stock",
    featured:featured==="1"||featured===true,visible:visible!=="0"&&visible!==false
  };
  if(image!==undefined) update.image=image;
  const result=await db.collection("products").updateOne({_id:new ObjectId(req.params.id)},{$set:update});
  if(!result.matchedCount) return res.status(404).json({error:"Product not found"});
  res.json({success:true});
}));

app.delete("/api/admin/products/:id", requireAuth, asyncHandler(async (req,res)=>{
  if(!validId(req.params.id)) return res.status(400).json({error:"Invalid product id"});
  const db=await initDb();
  await db.collection("products").deleteOne({_id:new ObjectId(req.params.id)});
  res.json({success:true});
}));

// Cloudinary signed upload parameters.
// The browser uploads the actual image directly to Cloudinary, so Vercel does not store files.
app.get("/api/admin/cloudinary-signature", requireAuth, (req,res)=>{
  const cloudName=process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey=process.env.CLOUDINARY_API_KEY;
  const apiSecret=process.env.CLOUDINARY_API_SECRET;
  if(!cloudName||!apiKey||!apiSecret)
    return res.status(500).json({error:"Cloudinary environment variables are not configured"});

  const timestamp=Math.floor(Date.now()/1000);
  const folder="obra-utensils";
  const signature=crypto.createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  res.json({cloudName,apiKey,timestamp,folder,signature});
});

app.use((err,req,res,next)=>{
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({error:process.env.NODE_ENV === "development" ? err.message : "Server error"});
});

module.exports=app;
