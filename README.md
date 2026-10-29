# React + Vite
Tech Stack
-  React + Vite
- @dnd-kit/core, @dnd-kit/sortable, state management with localstorage zustand, tailwind
 
Completed as of now
- Drag-and-drop canvas
- 8 droppable elements: Button, Text, Heading, Input, Image, Card, Badge, Divider
- Component naming
- Undo, Redo changes
- Device preview Desktop / Tablet / Mobile
- Export as .jsx file

## Node version
LTS 
v - 26.3.0

## Sass styles
`src/styles/main.scss` is loaded by the app entry point. Its `@import` glob patterns are expanded by the Vite Sass glob plugin before Sass compilation, so matching `.scss` files added under `src/components` or `src/styles` are included automatically.

## React Compiler
npm install
npm run dev

## Backend and API

The Express API uses Prisma Client and PostgreSQL. See [API.md](./API.md) for
endpoint documentation, request/response examples, and database setup.

For initial local setup, copy the environment template:

```sh
cp .env.example .env
```

Replace the placeholder `DATABASE_URL` in the project-root `.env` file with your
PostgreSQL connection URL, including the actual username, password, host, port,
and database name. URL-encode special characters in the username and password.
The database must already exist and be reachable. Do not commit `.env` or share
its contents. Set `JWT_SECRET` to a random secret of at least 32 bytes (for
example, generate one with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`).
Restart `npm run server` after changing environment variables.

For local frontend development, the API allows `http://localhost:5173` and
`http://127.0.0.1:5173` by default when `NODE_ENV` is not `production`. Set
`CORS_ORIGINS` to a comma-separated list of exact frontend origins for other
origins and deployments (for example, `https://app.example.com`). In
production, no browser origins are allowed unless explicitly listed. Restart
the API after changing this setting.

If the PostgreSQL provider
requires a custom CA, also set `DATABASE_CA_BASE64` to its Base64-encoded PEM;
the backend verifies the certificate and hostname. These variables are optional
for a local database except for `DATABASE_URL`. The `.env` file may also contain
`GEMINI_API_KEY` for AI generation. Keep these values server-side and never use
the `VITE_` prefix.

Run `npm run db:generate` after changing the Prisma schema. Use
`npm run db:deploy` to apply committed migrations. Start the backend with
`npm run server`; it listens on port 3001 by default (override with `PORT`) and
checks the database before accepting requests.

Authentication uses `POST /api/auth/register` and `POST /api/auth/login` to
obtain a one-hour bearer token. Supply it as `Authorization: Bearer <token>` for
all `/api/themes` and `/api/pages` requests. See [API.md](./API.md) for request
examples and the current-user endpoint.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
