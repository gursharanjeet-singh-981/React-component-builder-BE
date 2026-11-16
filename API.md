# API Documentation

## Swagger / OpenAPI

Start the backend with `npm run server`, then open:

- **Interactive Swagger UI:** <http://localhost:3001/api/docs/>
- **OpenAPI 3.0 JSON:** <http://localhost:3001/api/openapi.json>

Use your configured port or deployed backend host instead of `localhost:3001`
when applicable. Swagger UI sends requests to the same host that serves the
documentation. Expand an operation and select **Try it out** to call the API.
These calls use the real database, including creates, updates, and deletes.
Use **Authorize** with a bearer token before trying theme, page, or component
operations.

Frontend developers can import the JSON URL into Postman or an OpenAPI client
generator. For a theme/page workflow, create a theme first and replace the
example `themeId` with its returned ID before creating a page.

The contract is maintained in `server/src/openapi.js`. Update it alongside
route changes. It documents all health, theme, page, component, media, and integration
operations in `server/src`, including request/response schemas, examples,
filters, status codes, and validation rules. The documentation routes
themselves are not business operations in the contract.

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

### `PATCH /api/auth/me`

Updates the authenticated user's profile. Send one or both fields:

```json
{
  "name": "Alex Morgan",
  "profileImage": "data:image/png;base64,..."
}
```

Names must contain non-whitespace text and be at most 80 characters. Supported
profile images are PNG, JPEG, and WebP files up to 2 MB, sent as data URLs.
Set `profileImage` to `null` to remove the current image. The response contains
the updated user in `data.user`.

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

## Components

All component operations require a valid bearer token and are scoped to the
authenticated user.

### `GET /api/components`

Lists the authenticated user's saved components, most recently updated first.

### `POST /api/components`

Saves a reusable component.

Required body:

```json
{
  "name": "Hero Banner",
  "contentJson": {
    "rows": []
  }
}
```

`name` must contain non-whitespace text. `contentJson` must be a JSON object or
array. New components start at version `1`.

### `GET /api/components/:id`

Retrieves one saved component owned by the authenticated user.

### `PATCH /api/components/:id`

Updates any subset of `name` and `contentJson`. At least one field is required.
Updating `contentJson` increments `version`; renaming alone does not.

### `DELETE /api/components/:id`

Deletes a saved component owned by the authenticated user.

## GitHub and Vercel integrations

Integration operations use the user's normal bearer token. The backend stores
provider credentials encrypted with AES-256-GCM; configure
`INTEGRATION_TOKEN_ENCRYPTION_KEY` with a Base64-encoded random 32-byte key.
Provider credentials are never sent to or stored in the browser. Use HTTPS
outside local development.

Use GitHub and Vercel personal access tokens.

### Token settings and connections

- `GET /api/integrations/connections` returns connected account names, never
  credentials.
- `DELETE /api/integrations/:provider` removes the authenticated user's saved
  GitHub or Vercel token.
- `GET /api/integrations/publishing-results/:documentId` returns that
  authenticated user's saved repository and deployment links for a Builder
  document, or `null` when the document has not been published.
- `PUT /api/integrations/publishing-results/:documentId` stores the repository
  and deployment metadata in the database. Records are isolated by user and
  Builder document ID; provider credentials are not included.

`PUT /api/integrations/credentials/:provider` validates and securely saves a
GitHub or Vercel personal access token. The provider must be `github` or
`vercel`. A GitHub token needs permission to create repositories and write
repository contents. The response returns the provider and account name only;
the secret is never returned. The Settings page submits this request over
HTTPS. On the Builder toolbar, **Publish to GitHub** and **Deploy to Vercel**
use the saved credentials.

### `POST /api/integrations/github/publish`

Creates a repository and pushes a commit containing a minimal Vite/React
project with the generated JSX as `src/GeneratedPage.jsx`. The scaffold includes
Tailwind CSS and its PostCSS configuration so the utility classes generated by
the Builder are styled when the project is built. If a repository with the
requested name already exists under the connected GitHub account, the generated
project is pushed to it. This supports retrying after a repository was created
but a previous publish failed. Empty repositories are initialized with a README
commit before the generated project is pushed. Requires a connected GitHub
account. New repositories are private by default.

```json
{
  "name": "my-generated-page",
  "private": true,
  "pageName": "My Page",
  "jsx": "function MyPage() { return <main>Hello</main> }\\nexport default MyPage;"
}
```

The `201` response contains the repository ID, full name, URL, visibility,
commit SHA, and branch. The generated JSX must be no larger than 1 MB.

### `POST /api/integrations/vercel/deploy`

Creates a Vercel project if needed and starts a production deployment by
uploading the generated project files directly. The project is deployed from
the current Builder content and does not depend on Vercel's GitHub integration
or repository access. Requires a connected Vercel account:

```json
{
  "name": "my-generated-page",
  "pageName": "MyPage",
  "jsx": "function MyPage() { return <main>Hello</main> }\\nexport default MyPage;"
}
```

The `202` response contains the Vercel project ID, deployment ID and state, and
the deployment URL when Vercel returns it immediately. A queued deployment may
not yet have a URL; open the Vercel dashboard to follow its build status.
The deployment uses a Vite/React/Tailwind scaffold and the generated JSX as
`src/GeneratedPage.jsx`. JSX must be no larger than 1 MB.

Both operations return `502 INTEGRATION_ERROR` when a provider rejects a
request. Creating a GitHub repository cannot be rolled back if a later commit
step fails; check the GitHub account before retrying with the same repository
name.

## Media assets

Media endpoints require a valid bearer token. Images are stored in the database
and scoped to the authenticated user. Folder paths are retained as relative
paths (for example, `Brand/Logos`). In the dashboard's Media tab, choose
**New folder** to create an empty folder, then select it before choosing
**Upload images** to upload files into it. **Upload folder** imports a
directory tree and retains its relative structure.

Supported formats are PNG, JPEG, GIF, WebP, and AVIF, up to 7 MB per image.
The API validates both the declared format and image signature.

### `GET /api/media`

Lists the authenticated user's images, including `id`, `name`, `folderPath`,
`mimeType`, `size`, and `createdAt`. Image bytes are not included in this
metadata response.

### `POST /api/media`

Creates an image asset. `folderPath` is optional and defaults to the root
folder. Send Base64 image bytes in `contentBase64`:

```json
{
  "name": "hero.png",
  "folderPath": "Brand/Images",
  "mimeType": "image/png",
  "contentBase64": "iVBORw0KGgo..."
}
```

### `GET /api/media/folders`

Lists the authenticated user's folders, including folders that do not contain
images yet. Each result includes `id`, `name`, `path`, and `createdAt`.

### `POST /api/media/folders`

Creates an empty folder. `parentPath` is optional; when provided, it must
identify an existing folder owned by the authenticated user:

```json
{
  "name": "Product photos",
  "parentPath": "Brand"
}
```

Folder names must be at most 100 characters and cannot contain path separators.
Folder paths are unique per user.

### `GET /api/media/:id/content`

Returns the original image bytes with the validated image MIME type. The
authenticated user must own the asset.

### `DELETE /api/media/:id`

Deletes an image asset owned by the authenticated user.

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
| `413` | Request body exceeds 10 MB or an image exceeds 7 MB |
| `503` | Database unavailable for the health check |
| `500` | Unexpected server error |

## Database setup and migrations

1. Set `DATABASE_URL` in the project-root `.env` file.
2. Set `JWT_SECRET` to a random secret of at least 32 bytes.
3. Configure `INTEGRATION_TOKEN_ENCRYPTION_KEY` with a Base64-encoded random
   32-byte key. Generate it with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
   Keep this key stable or previously saved tokens cannot be decrypted. Keep
   all credentials server-side; never use a `VITE_` prefix.
4. For PostgreSQL providers requiring a custom CA, set `DATABASE_CA_BASE64` to
   the Base64-encoded PEM. The API verifies the server certificate and hostname
   when this value is set. It is optional for local databases.
5. Generate Prisma Client with `npm run db:generate`.
6. Apply committed migrations with `npm run db:deploy`.
7. Start the API with `npm run server`.

The user-scoping migration leaves pre-existing themes and pages unassigned
(`userId` is null), so they are not visible through the API. Their records are
preserved; assign them to the appropriate user through a trusted, reviewed
data migration if they need to be retained as user-owned resources.

The Prisma schema is in `prisma/schema.prisma`. Do not expose database
credentials through `VITE_`-prefixed variables.
