# API Documentation

## Swagger / OpenAPI

Start the backend with `npm run server`, then open:

- **Interactive Swagger UI:** <http://localhost:3001/api/docs/>
- **OpenAPI 3.0 JSON:** <http://localhost:3001/api/openapi.json>

Use your configured port or deployed backend host instead of `localhost:3001`
when applicable. Swagger UI sends requests to the same host that serves the
documentation. Expand an operation and select **Try it out** to call the API.
These calls use the real database, including creates, updates, and deletes.
Use **Authorize** with a bearer token before trying theme or page operations.

Frontend developers can import the JSON URL into Postman or an OpenAPI client
generator. For a theme/page workflow, create a theme first and replace the
example `themeId` with its returned ID before creating a page.

The contract is maintained in `server/src/openapi.js`. Update it alongside
route changes. It documents all health, theme, and page operations in
`server/src`, including request/response schemas, examples, filters, status
codes, and validation rules. The documentation routes themselves are not
business operations in the contract.

The Express API runs on `http://localhost:3001` by default. Set `PORT` to
change the port. All endpoints are prefixed with `/api`, use JSON request and
response bodies, and return errors in this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A human-readable explanation."
  }
}
```

Successful resource responses use `{ "data": ... }`; list endpoints return
`{ "data": [...] }`. Delete endpoints return `204 No Content`.

## Authentication

Authentication uses email and password. Users can access only the themes and
pages they own. Health checks and API documentation remain public. Attempts to
read, modify, publish, or delete another user's resource return `404 NOT_FOUND`,
just like a resource that does not exist.

Set `JWT_SECRET` in the server environment to a random secret of at least 32
bytes. For example, generate one with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
Keep it private and use the same value across backend instances.

### `POST /api/auth/register`

Creates an account and returns a bearer access token. Email addresses are
trimmed and stored in lowercase. Passwords must be non-empty; no minimum
length, maximum length, or complexity rules are enforced.

```json
{
  "email": "user@example.com",
  "password": "strong-password"
}
```

The `201` response contains `data.user`, `data.accessToken`,
`data.tokenType` (`Bearer`), and `data.expiresIn` (seconds). A duplicate email
returns `409 CONFLICT`.

### `POST /api/auth/login`

Accepts the same email/password body and returns the same token response.
Incorrect credentials return `401 INVALID_CREDENTIALS`.

### `GET /api/auth/me`

Returns the current user. Send the token in the request header:

```text
Authorization: Bearer <accessToken>
```

Access tokens expire after one hour. There is no refresh or logout endpoint;
clients should log in again after expiration.

## Health

### `GET /api/health`

Checks the database connection.

- `200`: `{ "status": "ok", "database": "connected", ... }`
- `503`: `{ "status": "error", "database": "unavailable", ... }`

## Themes

All theme and page operations require a valid bearer token.

### `GET /api/themes`

Lists the authenticated user's themes, newest first. Each theme includes
`_count.pages`. Theme slugs are unique per user.

### `POST /api/themes`

Creates a theme.

Required body:

```json
{
  "name": "Brand",
  "slug": "brand",
  "configJson": {
    "colors": {
      "primary": "#0055aa"
    }
  }
}
```

### `GET /api/themes/:id`

Gets one theme by its ID, including `_count.pages`.

### `PATCH /api/themes/:id`

Updates any subset of `name`, `slug`, and `configJson` on a theme owned by the
authenticated user. At least one field is required. `configJson` must be a
JSON object or array.

### `DELETE /api/themes/:id`

Deletes a theme owned by the authenticated user if it has no pages. Returns
`404 NOT_FOUND` for another user's theme and `409 CONFLICT` while pages still
reference it (`onDelete: Restrict`).

## Pages

### `GET /api/pages`

Lists the authenticated user's pages, newest first. Optionally filter with
`themeId` and/or `status`:

```text
GET /api/pages?themeId=<theme-id>&status=PUBLISHED
```

Valid statuses are `DRAFT` and `PUBLISHED`. Each result includes its theme's
`id`, `name`, and `slug`.

### `POST /api/pages`

Creates a page owned by the authenticated user. The referenced theme must
belong to that same user; a missing or other user's theme returns
`404 NOT_FOUND`. Page slugs are unique per user.

Required body:

```json
{
  "name": "Home",
  "slug": "home",
  "themeId": "<theme-id>",
  "contentJson": {
    "sections": []
  },
  "status": "DRAFT"
}
```

`status` is optional and defaults to `DRAFT`. `contentJson` must be a JSON
object or array. New pages start at version `1`.

### `GET /api/pages/:id`

Gets one page by its ID, including its theme's `id`, `name`, and `slug`.

### `PATCH /api/pages/:id`

Updates any subset of `name`, `slug`, `themeId`, `contentJson`, and `status` on
a page owned by the authenticated user. Any replacement theme must also belong
to that user. At least one field is required. Updating `contentJson` increments
`version`; other field updates do not.

### `POST /api/pages/:id/publish`

Sets the authenticated user's page status to `PUBLISHED`.

### `DELETE /api/pages/:id`

Deletes a page owned by the authenticated user.

## Common status codes

| Status | Meaning |
| --- | --- |
| `200` | Request succeeded |
| `201` | Resource created |
| `204` | Resource deleted |
| `400` | Invalid JSON, invalid field, or missing required field |
| `401` | Missing, invalid, or expired access token (or invalid login credentials) |
| `404` | Resource or API endpoint not found |
| `409` | Duplicate slug, missing referenced theme, or restricted delete |
| `413` | Request body exceeds 10 MB |
| `503` | Database unavailable for the health check |
| `500` | Unexpected server error |

## Database setup and migrations

1. Set `DATABASE_URL` in the project-root `.env` file.
2. Set `JWT_SECRET` to a random secret of at least 32 bytes.
3. For PostgreSQL providers requiring a custom CA, set `DATABASE_CA_BASE64` to
   the Base64-encoded PEM. The API verifies the server certificate and hostname
   when this value is set. It is optional for local databases.
4. Generate Prisma Client with `npm run db:generate`.
5. Apply committed migrations with `npm run db:deploy`.
6. Start the API with `npm run server`.

The user-scoping migration leaves pre-existing themes and pages unassigned
(`userId` is null), so they are not visible through the API. Their records are
preserved; assign them to the appropriate user through a trusted, reviewed
data migration if they need to be retained as user-owned resources.

The Prisma schema is in `prisma/schema.prisma`. Do not expose database
credentials through `VITE_`-prefixed variables.
