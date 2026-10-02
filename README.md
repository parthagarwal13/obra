# MAI RAM JAI BHAGAWAN — Vercel + Neon Postgres + Cloudinary

Production-ready MAI RAM JAI BHAGAWAN utensils catalogue with a Neon Postgres database.

## Architecture

- Frontend: `public/`
- API: `api/index.js`
- Database: Neon Postgres
- Product images: Cloudinary
- Hosting: Vercel
- Authentication: JWT stored in an HTTP-only cookie

The application does not use the local filesystem for permanent shop data.

## 1. Configure Neon

Create a project in [Neon](https://neon.com/). In the Neon Console, open **Connect** and copy the pooled connection string for your database. Keep the SSL setting supplied by Neon.

Copy `.env.example` to `.env` and set:

```text
DATABASE_URL=your-complete-neon-connection-string
```

The API creates the `admins`, `categories`, `products`, `orders`, and `order_items` tables and seeds the default categories on its first request. IDs use UUIDs. Customers can place guest-checkout orders with their contact and delivery details; order and product/quantity/price snapshots are saved in Neon. The admin portal lists complete order details and can delete unwanted orders. Existing MongoDB data and `data/shop-data.json` are not automatically imported; add products through the admin panel after connecting Neon.

## 2. Configure Cloudinary

Create a Cloudinary account, then copy the cloud name, API key, and API secret from its dashboard into `.env` (and Vercel environment variables):

```text
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

The admin panel uploads images directly to Cloudinary using a short-lived signed request. Neon stores the secure image URL.

## 3. Configure admin access

Set a strong password and a random JWT secret of at least 32 characters:

```text
JWT_SECRET=your-long-random-secret-at-least-32-characters
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-admin-password
```

The API creates this admin account on its first request if it does not exist. When `ADMIN_PASSWORD` changes, the API updates the existing account on its next request. Never commit `.env` to GitHub.

## 4. Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## 5. Deploy to Vercel

Push the project to GitHub and import it into Vercel. Add all values from `.env.example` under **Project Settings → Environment Variables**, then redeploy. For local serverless testing, install Vercel CLI and run `vercel dev`.

## API routes

Public:
- `GET /api/store`
- `POST /api/orders`

Admin:
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET /api/admin/dashboard`
- `GET /api/admin/orders`
- `DELETE /api/admin/orders/:id`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/cloudinary-signature`
