# mdbin

Markdown pastebin.

The browser editor is available at `GET /new`. The root path redirects to the configured homepage at `/api/v1/p/:id`.

## API

The OpenAPI 3.0.3 specification is available as JSON at `GET /api`. All application API endpoints are versioned under `/api/v1`.

### `GET /api/v1/p/:id`

Render a saved page as HTML. Returns `404 Not found` when the page does not exist.

### `GET /api/v1/md/:id`

Return the saved page's Markdown as `text/plain`. Returns `404 Not found` when the page does not exist.

### `POST /api/v1/p`

Create a page by sending non-empty Markdown as a raw `text/plain` request body (maximum 512000 bytes). Returns `201` with JSON `{ "id": "...", "url": "https://.../api/v1/p/..." }` and a `Location` header. Empty input returns `400`; oversized input returns `413`.

### `PUT /api/v1/p/:id`

Create or replace a page using the same raw `text/plain` body format and limits as `POST`. Returns `201` with the same JSON response shape; empty input returns `400`, and oversized input returns `413`.

### `DELETE /api/v1/p/:id`

Delete a page. Returns `200` with the plain-text body `OK`.

### `GET /api/v1/g/:org/:repo[/:ref[/:path]]`

Render a GitHub file as HTML. The ref defaults to `main` and the file path defaults to `README.md`.
