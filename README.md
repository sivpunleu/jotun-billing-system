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
