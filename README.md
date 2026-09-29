# Obra Utensils Shop — Vercel + MongoDB + Cloudinary

Production-ready version for deploying the Obra utensils catalogue to GitHub and Vercel.

## Architecture

- Frontend: `public/`
- API: `api/index.js`
- Database: MongoDB Atlas
- Product images: Cloudinary
- Hosting: Vercel
- Authentication: JWT stored in an HTTP-only cookie

Vercel's local filesystem is NOT used for permanent shop data.

## 1. Local test

```bash
npm install
npm start
```

Copy `.env.example` to `.env` and fill in the values before starting the app. Local `npm start` uses the same MongoDB API as Vercel; it does not write catalogue data to the old JSON file.

## 2. MongoDB Atlas

Create a MongoDB Atlas cluster and database user.

Create a database named `obra_utensils`.

In Atlas Network Access, allow the outbound IPs used by your Vercel functions. Vercel's [Static IP feature](https://vercel.com/kb/guide/can-i-get-a-fixed-ip-address) can provide stable egress IPs when available on your plan; add those IPs to the Atlas allowlist. Avoid `0.0.0.0/0` for production because it allows connections from any IP.

Get your connection string and put it in Vercel as:

`MONGODB_URI`

Also add:

`MONGODB_DB=obra_utensils`

## 3. Cloudinary

Create a Cloudinary account.

Get:
- Cloud name
- API key
- API secret

Add these Vercel environment variables:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

The admin panel uploads images directly to Cloudinary using a short-lived signed upload request. The MongoDB product record stores the resulting secure image URL.

## 4. Admin environment variables

Add:

```text
JWT_SECRET=<long-random-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your-real-password>
```

Do NOT put `.env` into GitHub.

## 5. Deploy to Vercel

Push this entire folder to GitHub.

Then import the repository into Vercel.

In Vercel → Project → Settings → Environment Variables, add all variables from `.env.example`.

Redeploy after saving variables.

On the first request, the API creates the admin account from `ADMIN_USERNAME` and `ADMIN_PASSWORD` and seeds the default categories if the collections are empty. Set a strong admin password before the first deployment. Changing those variables later does not overwrite an admin account that already exists.

## API routes

Public:
- `GET /api/store`

Admin:
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET /api/admin/dashboard`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/cloudinary-signature`

## Important

Do not use the old JSON-storage backend for production if multiple devices need to edit the catalogue. This version uses MongoDB Atlas, so categories/products remain available after Vercel deployments.

For local serverless testing, install Vercel CLI (`npm i -g vercel`) and run `vercel dev`.
