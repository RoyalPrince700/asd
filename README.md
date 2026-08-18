# Accessible Stock Dashboard

MERN stock ledger with two roles:

- **Clerk** posts product movement: name, opening balance, in, out, stock received, stock out. Closing balance is calculated automatically.
- **CFO** monitors totals, charts, and the full ledger, then downloads **Excel** or **Word** reports.

## Stack

- Frontend: React + Vite
- Backend: Express + MongoDB + JWT
- Reports: ExcelJS and docx

## Setup

1. Put your MongoDB Atlas connection string in `backend/.env` as `MONGO_URI`. Use the database user from Atlas → Database Access, and allow your IP under Network Access.
2. Install dependencies in each app (not at the project root):

```bash
cd backend
npm install
cd ../frontend
npm install
cd ..
```

3. Seed demo users and stock rows:

```bash
npm run seed
```

4. Run the API and Vite in two terminals:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Optional: `npm install` at the project root only if you want `npm run dev` to start both apps together. That install is just for `concurrently` and is not required.

- App: http://localhost:5173
- API: http://localhost:5000

## Demo logins

| Role | Email | Password |
| --- | --- | --- |
| CFO | cfo@company.com | password123 |
| Clerk | clerk@company.com | password123 |

Closing balance formula:

`opening + in + stock received − out − stock out`
