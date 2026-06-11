# Jotun Billing System

A small invoice management application built with:

- Node.js, Express, and MongoDB
- Vue 3, Vite, Bootstrap 5, and BootstrapVueNext

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and update the MongoDB URI.
   If MongoDB is unavailable, the backend automatically uses
   `backend/data/invoices.json` for local development.
2. Install and start the backend:

```bash
cd backend
npm install
npm run dev
```

3. In another terminal, install and start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and the API runs at
`http://localhost:5000`.

## Admin authentication

Admin invoice pages, the invoice list, and create/edit/delete actions require
an admin login. Customer-facing invoice links use random share tokens at
`/public/invoices/:token`.

Generate a bcrypt password hash:

```bash
cd backend
npm run hash-password
```

Generate a JWT signing secret:

```bash
npm run generate-jwt-secret
```

Add the generated values to `backend/.env`:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$...
JWT_SECRET=long-random-secret
JWT_EXPIRES_IN=8h
```

Passwords and JWT secrets must only be stored in environment variables. Never
add them to frontend code or commit them to Git.

The first successful environment-admin login creates an `owner` account in
the application database. The owner can then create more accounts:

- `owner`: full access, admin management, and JSON backup
- `admin`: manage invoices, payments, customers, products, and audit logs
- `viewer`: read-only access

## Billing features

- Atomic sequential invoice numbers in `INV-YYYY-00001` format
- Draft, unpaid, partially paid, paid, and cancelled statuses
- Payment history with amount, date, receiver, note, and recording admin
- Dashboard revenue, outstanding balance, paid invoice, and status metrics
- Customer and product catalogues that populate the invoice form
- Audit logging for management and security actions
- Recoverable trash and restore for invoices, customers, and products
- Server-side pagination and filters
- Personal profiles with a compressed avatar, display name, password controls,
  last login details, and personal activity history
- Invoice CSV export and owner-only JSON database backup
- Telegram delivery for invoices, payment receipts, and debt alerts
- A shared A4 layout for browser preview and Print / Save PDF

Downloaded backups contain private customer and business data. Store them in a
secure location.

## Deploy

### 1. MongoDB Atlas

1. Create an Atlas cluster and database user.
2. Add the required IP access entry.
3. Copy the Node.js connection string for `MONGO_URI`.

Production requires MongoDB. The local JSON fallback is development-only.

### 2. Backend on Render

1. Push this repository to GitHub.
2. In Render, create a Blueprint from the repository. Render reads
   `render.yaml`.
3. Set these environment variables:

```text
MONGO_URI=mongodb+srv://...
CLIENT_URL=https://your-frontend.vercel.app
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$...
JWT_SECRET=long-random-secret
JWT_EXPIRES_IN=8h
TELEGRAM_BOT_TOKEN=123456789:replace-with-bot-token
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_PUBLIC_URL=https://your-frontend.vercel.app
```

After deployment, test:

```text
https://your-backend.onrender.com/api/health
```

### 3. Frontend on Vercel

1. Import the same GitHub repository.
2. Set the Root Directory to `frontend`.
3. Add this environment variable:

```text
VITE_API_URL=https://your-backend.onrender.com/api
```

4. Deploy, then copy the Vercel URL into Render's `CLIENT_URL` and redeploy
   the backend.

## Telegram alerts

1. Create a bot with `@BotFather` and copy its token.
2. Open the bot and send `/start`. For a group or channel, add the bot and
   allow it to post messages.
3. Read the target chat ID from the Bot API `getUpdates` response.
4. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to Render Environment.
   `TELEGRAM_PUBLIC_URL` is optional; when omitted, the first `CLIENT_URL`
   value is used for invoice links.
5. Redeploy the backend.

Bot tokens must stay in backend environment variables. Never put a Telegram
token in Vue code, Vercel variables exposed with `VITE_`, screenshots, or Git.

After configuration:

- Invoice Preview can send the invoice summary and public invoice link.
- Payment Receipt and payment history can send receipt details.
- Notification Center can send an overdue and outstanding debt summary.
- Every send action is recorded in Audit Log.
