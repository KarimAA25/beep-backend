# Beep

A functional two-APK Lebanese ride-hailing prototype: `backend/` (Node.js + Express + Socket.IO, in-memory state, no database), `mobile/passenger/` and `mobile/driver/` (Expo + React Native + expo-dev-client), and `mobile/shared/` (types, socket client, API client shared by both apps).

No auth, no registration — both apps are hardcoded to a single fixed test identity each (`passenger_01` / `driver_01`).

## Running the backend locally

```
cd backend
npm install
npm run dev
```

Serves on `http://localhost:3000` by default (`PORT` / `CORS_ORIGIN` in `backend/.env`).

## Running the mobile apps

Both apps need a custom dev client (not Expo Go, since MapLibre requires native modules):

```
cd mobile/passenger   # or mobile/driver
npx expo run:android --device
```

Each app's `BACKEND_URL` in `App.tsx` is currently a hardcoded LAN IP — update it to match whichever backend the app should talk to (your machine's LAN IP for local dev, or the Render URL below once deployed).

## Deployment (Render)

The backend deploys via the `render.yaml` Blueprint at the repo root — connect this repo in the Render dashboard under **New > Blueprint**.

**Free-tier cold starts:** Render's free tier spins the service down after a period of inactivity. The first request after idle can take 30–60+ seconds to respond while it wakes up. **Verify this before any live demo** — hit the `/health` endpoint a minute or two beforehand to warm it up, or upgrade off the free tier if the demo timing is tight.

## Map tiles / routing

MapLibre renders raw OpenStreetMap raster tiles, and routing goes through the public OSRM demo server (`router.project-osrm.org`). Both are free and keyless, but explicitly meant for light/prototype use, not production traffic — see the relevant comments in the mobile map code (Phase 5) for details.
