# Accessible Stock Dashboard

A MERN stock management dashboard for **Accessible Publishers Limited (APL)** and **Trifone**. The CFO uploads product catalogues from Excel, clerks post stock movements by company, and the CFO monitors totals, charts, and downloadable reports.

## Features

### Multi-company product catalogues

The CFO manages two separate catalogues from **Product catalog**:

| Company | Tab | Upload format |
|---------|-----|---------------|
| **Accessible Publishers Limited (APL)** | Accessible | `BookName` + location stock counts |
| **Trifone** | Trifone | Stock register with **August-only** columns |

Uploading replaces the full catalogue for that company. Use **Update catalog** to refresh figures from a new month's Excel while keeping products not in the file. A template can be downloaded from the same page.

#### APL catalogue columns

- **BookName** — book title
- **HO, AK, AB, ED, LA, KA, US, AN, ANX** — stock count per location
- Ignored if present: `Sale Price`, `AllTotal`, `Total`

Blank cells and `-` are treated as `0`.

#### Trifone catalogue columns

Upload the full **Stock & Maintenance Operations Register** spreadsheet. The app reads **August data only** and ignores April–July dated columns.

Imported fields include:

- `ITEM NAME`
- August opening stock (2/8, 9/8, 16/8)
- `Restock (2/8/2026)`
- `Current Stock`, maintenance, returns, sales, pricing, and `Remarks`

### Roles

| Role | Route | What they can do |
|------|-------|------------------|
| **Administrator** | `/admin` | View all users, change roles (`clerk`, `cfo`, `admin`), delete users |
| **CFO** | `/overview`, `/products` | Monitor stock position, filter by company/product/date, download Excel/Word reports, upload and browse product catalogues |
| **Data clerk** | `/entry` | Post stock in/out for APL or Trifone products from the uploaded catalogue |

New sign-ups at `/signup` are created as **clerk** by default. An administrator can promote users to CFO or admin.

### Clerk workflow

1. Select **company** — APL or Trifone
2. Select **product** from that company’s uploaded catalogue
3. Enter **date**, **in**, and **out**
4. **Opening quantity** is calculated automatically from prior ledger entries for that product and company
5. **Closing quantity** = opening + in − out

Clerks can edit and delete their own posted records.

### CFO overview

- Filter ledger by company, product, and date range
- KPI cards: products in catalog, companies, opening/in/out/closing totals
- Charts: daily movement and closing by company (APL vs Trifone)
- Full ledger table of all clerk postings
- Export **Excel** or **Word** reports

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, React Router, Recharts, Lucide icons |
| Backend | Express, MongoDB (Mongoose), JWT, bcrypt |
| Uploads | Multer + ExcelJS |
| Reports | ExcelJS, docx |

## Project structure

```
cfodashboard/
├── backend/
│   ├── src/
│   │   ├── constants/companies.js   # APL/Trifone config, locations, Trifone fields
│   │   ├── models/                  # User, Product, StockRecord
│   │   ├── routes/                  # auth, products, records, reports, users
│   │   ├── utils/                   # Excel parsers, stock calculations, seed
│   │   └── server.js
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/                   # Login, Signup, ClerkHome, CfoHome, CfoProducts, AdminHome
│   │   ├── components/              # Layout, ProtectedRoute
│   │   ├── constants/companies.js
│   │   └── api.js
│   └── .env
└── package.json                     # Optional root scripts (concurrently)
```

## Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB)
- npm

## Environment variables

### Backend (`backend/.env`)

Copy from `backend/.env.example`:

```env
PORT=5000
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/cfodashboard
JWT_SECRET=your-secret-key
CLIENT_ORIGIN=http://localhost:5173
```

Optional admin bootstrap (created on server start if no admin exists):

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
ADMIN_NAME=System Admin
```

**MongoDB Atlas setup**

1. Create a database user under **Database Access**
2. Allow your IP under **Network Access**
3. Copy the connection string into `MONGO_URI`

### Frontend (`frontend/.env`)

Copy from `frontend/.env.example`:

```env
# Leave empty for local dev — Vite proxies /api to localhost:5000
VITE_API_URL=
```

For production, set `VITE_API_URL` to your deployed API URL (e.g. `https://your-app.onrender.com`).

## Setup

### 1. Install dependencies

Install in each app (not at the project root):

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

Optional — run both apps from the project root:

```bash
npm install
```

### 2. Configure environment

Create `backend/.env` and `frontend/.env` using the examples above.

### 3. Seed demo users (optional)

From the project root:

```bash
npm run seed
```

Or from `backend/`:

```bash
npm run seed
```

This resets the database and creates:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@company.com` | `password123` |
| Clerk | `clerk@company.com` | `password123` |

No demo products are seeded — upload catalogues via the CFO **Product catalog** page.

### 4. Run the app

**Option A — two terminals**

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

**Option B — single command (after root `npm install`)**

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:5000 |

## Usage guide

### First-time CFO setup

1. Log in as CFO (or have an admin promote your account)
2. Go to **Product catalog**
3. Select **Accessible Publishers Limited** or **Trifone**
4. Upload the Excel catalogue (or download the template first)
5. Confirm the inventory table shows the imported data

### Clerk daily posting

1. Log in as clerk
2. Open **Stock movement dashboard**
3. Choose **APL** or **Trifone**
4. Select a product, enter in/out quantities, and post

### Admin user management

1. Log in as admin
2. Open **Users**
3. Change a user’s role or remove accounts

## API overview

All protected routes require `Authorization: Bearer <token>`.

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Sign up (clerk role) |
| POST | `/api/auth/login` | Public | Log in |
| GET | `/api/auth/me` | Any | Current user |
| GET | `/api/products` | Any | List products (supports `company`, `search`, `page`, `limit`) |
| POST | `/api/products/upload` | CFO | Upload catalogue Excel |
| GET | `/api/products/template` | CFO | Download upload template |
| GET | `/api/products/stock-level` | Any | Opening balance for product + company |
| GET/POST/PUT/DELETE | `/api/records` | Clerk/CFO | Stock movement ledger |
| GET | `/api/records/summary` | CFO | Aggregated totals and charts data |
| GET | `/api/reports/excel` | CFO | Download Excel report |
| GET | `/api/reports/docx` | CFO | Download Word report |
| GET/PATCH/DELETE | `/api/users` | Admin | User management |

## Production notes

- Set a strong `JWT_SECRET` in production
- Set `CLIENT_ORIGIN` to your frontend URL for CORS
- Set `VITE_API_URL` on the frontend to the deployed API
- Run the backend with `npm start` inside `backend/`
- Build the frontend with `npm run build` inside `frontend/`

## License

Private — internal use for Accessible Publishers Limited and Trifone stock operations.
