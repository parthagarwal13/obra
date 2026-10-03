require("dotenv").config();

const express = require("express");
const path = require("path");
const api = require("./api");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(api);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`MAI RAM JAI BHAGWAN running at http://localhost:${port}`);
});
