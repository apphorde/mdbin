import createServer from "@cloud-cli/http";
import MarkdownIt from "markdown-it";
import { randomUUID } from "node:crypto";

const { STORE_URL, HOMEPAGE_ID } = process.env;
const MAX_PAYLOAD_BYTES = 500 * 1024;
const openApi = {
  openapi: "3.0.3",
  info: { title: "mdbin API", version: "1.0.0", description: "Markdown page storage and rendering API." },
  paths: {
    "/api": {
      get: {
        summary: "Get the OpenAPI specification",
        responses: {
          200: {
            description: "OpenAPI specification",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/api/v1/p": {
      post: {
        summary: "Create a page",
        requestBody: {
          required: true,
          content: {
            "text/plain": {
              schema: {
                type: "string",
                "x-maxBytes": 512000,
                description: "Non-empty UTF-8 Markdown payload; maximum 512000 bytes.",
              },
            },
          },
        },
        responses: {
          201: {
            description: "Page created",
            headers: { Location: { schema: { type: "string" }, description: "Versioned page path." } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PageResponse" } } },
          },
          400: {
            description: "Empty or whitespace-only payload",
            content: {
              "text/plain": { schema: { type: "string", example: "Bad request. Provide markdown text as input." } },
            },
          },
          413: {
            description: "Payload exceeds 512000 bytes",
            content: { "text/plain": { schema: { type: "string", example: "Payload too large" } } },
          },
        },
      },
    },
    "/api/v1/p/{id}": {
      parameters: [{ $ref: "#/components/parameters/id" }],
      get: {
        summary: "Render a page",
        responses: {
          200: { description: "Rendered HTML", content: { "text/html": { schema: { type: "string" } } } },
          404: { $ref: "#/components/responses/NotFound" },
          405: { $ref: "#/components/responses/MethodNotAllowed" },
        },
      },
      put: {
        summary: "Create or replace a page",
        requestBody: {
          required: true,
          content: {
            "text/plain": {
              schema: {
                type: "string",
                "x-maxBytes": 512000,
                description: "Non-empty UTF-8 Markdown payload; maximum 512000 bytes.",
              },
            },
          },
        },
        responses: {
          201: {
            description: "Page stored",
            headers: { Location: { schema: { type: "string" }, description: "Versioned page path." } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/PageResponse" } } },
          },
          400: {
            description: "Empty or whitespace-only payload",
            content: {
              "text/plain": { schema: { type: "string", example: "Bad request. Provide markdown text as input." } },
            },
          },
          413: {
            description: "Payload exceeds 512000 bytes",
            content: { "text/plain": { schema: { type: "string", example: "Payload too large" } } },
          },
        },
      },
      delete: {
        summary: "Delete a page",
        responses: {
          200: {
            description: "Page deleted",
            content: { "text/plain": { schema: { type: "string", example: "OK" } } },
          },
        },
      },
    },
    "/api/v1/md/{id}": {
      parameters: [{ $ref: "#/components/parameters/id" }],
      get: {
        summary: "Get page Markdown",
        responses: {
          200: { description: "Raw Markdown", content: { "text/plain": { schema: { type: "string" } } } },
          404: { $ref: "#/components/responses/NotFound" },
          405: { $ref: "#/components/responses/MethodNotAllowed" },
        },
      },
    },
    "/api/v1/g/{org}/{repo}": {
      parameters: [
        { name: "org", in: "path", required: true, schema: { type: "string" } },
        { name: "repo", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        summary: "Render a GitHub file",
        description: "Fetches README.md from the main branch of the repository.",
        responses: {
          200: { description: "Rendered HTML", content: { "text/html": { schema: { type: "string" } } } },
          404: { $ref: "#/components/responses/NotFound" },
          405: { $ref: "#/components/responses/MethodNotAllowed" },
        },
      },
    },
    "/api/v1/g/{org}/{repo}/{ref}": {
      parameters: [
        { name: "org", in: "path", required: true, schema: { type: "string" } },
        { name: "repo", in: "path", required: true, schema: { type: "string" } },
        { name: "ref", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        summary: "Render a GitHub file",
        description: "Fetches README.md from the specified branch or ref.",
        responses: {
          200: { description: "Rendered HTML", content: { "text/html": { schema: { type: "string" } } } },
          404: { $ref: "#/components/responses/NotFound" },
          405: { $ref: "#/components/responses/MethodNotAllowed" },
        },
      },
    },
    "/api/v1/g/{org}/{repo}/{ref}/{path}": {
      parameters: [
        { name: "org", in: "path", required: true, schema: { type: "string" } },
        { name: "repo", in: "path", required: true, schema: { type: "string" } },
        { name: "ref", in: "path", required: true, schema: { type: "string" } },
        {
          name: "path",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "File path within the repository; remaining slash-separated URL segments are included.",
        },
      ],
      get: {
        summary: "Render a GitHub file",
        description: "Fetches the specified file from raw.githubusercontent.com.",
        responses: {
          200: { description: "Rendered HTML", content: { "text/html": { schema: { type: "string" } } } },
          404: { $ref: "#/components/responses/NotFound" },
          405: { $ref: "#/components/responses/MethodNotAllowed" },
        },
      },
    },
  },
  components: {
    parameters: { id: { name: "id", in: "path", required: true, schema: { type: "string" } } },
    responses: {
      NotFound: {
        description: "Page or remote file not found",
        content: { "text/plain": { schema: { type: "string", example: "Not found" } } },
      },
      MethodNotAllowed: {
        description: "HTTP method is not supported for this endpoint",
        content: { "text/plain": { schema: { type: "string", example: "Method not allowed" } } },
      },
    },
    schemas: {
      PageResponse: {
        type: "object",
        required: ["id", "url"],
        properties: { id: { type: "string", format: "uuid" }, url: { type: "string", format: "uri" } },
      },
    },
  },
};

createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  if (url.pathname === "/") {
    response.writeHead(302, { Location: "/api/v1/p/" + HOMEPAGE_ID });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(openApi));
    return;
  }

  if (request.method === "GET" && url.pathname === "/new") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>New page</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" /></head>
<body class="h-screen"><form id="editor" class="h-full"><button class="fixed top-4 right-4 px-5 py-2 bg-blue-600 text-white rounded" type="submit">Submit</button>
<textarea id="content" aria-label="Markdown content" required class="w-full h-full p-6 pt-20 resize-none focus:outline-none" placeholder="Write markdown..."></textarea>
<p id="error" role="alert" class="fixed bottom-4 left-4 text-red-600"></p></form>
<script>
document.querySelector("#editor").addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = document.querySelector("#content").value;
  const error = document.querySelector("#error");
  if (!content.trim()) {
    error.textContent = "Please enter some markdown.";
    return;
  }
  if (new TextEncoder().encode(content).length > ${MAX_PAYLOAD_BYTES}) {
    error.textContent = "Content must be no larger than 500 KB.";
    return;
  }
  error.textContent = "";
  try {
    const response = await fetch("/api/v1/p", { method: "POST", headers: { "content-type": "text/plain" }, body: content });
    const result = await response.json();
    if (!response.ok) throw new Error("Unable to create page.");
    window.location.assign(result.url);
  } catch (e) { error.textContent = e.message || "Unable to create page."; }
});
</script></body></html>`);
    return;
  }

  if (url.pathname.startsWith("/api/v1/md/")) {
    if (request.method !== "GET") {
      response.writeHead(405).end("Method not allowed");
      return;
    }

    const id = url.pathname.replace("/api/v1/md/", "");

    if (!id) {
      notFound(response);
      return;
    }

    const store = await fetch(STORE_URL + "/p/" + id);

    if (store.status !== 200) {
      notFound(response);
      return;
    }

    const json = await store.json();
    response.writeHead(200, { "content-type": "text/plain" }).end(json.content);
    return;
  }

  if (url.pathname.startsWith("/api/v1/p/")) {
    const id = url.pathname.replace("/api/v1/p/", "");

    if (!id) {
      notFound(response);
      return;
    }

    if (request.method === "DELETE") {
      await fetch(STORE_URL + "/p/" + id, { method: "DELETE" });
      response.end("OK");
      return;
    }

    if (request.method === "PUT") {
      const body = await readStream(request);

      if (body === null) {
        response.writeHead(413).end("Payload too large");
        return;
      }

      if (body.trim()) {
        await storePage(id, body.trim());
        sendPageResponse(response, id, request.headers["x-forwarded-host"]);
        return;
      }

      response.writeHead(400).end("Bad request. Provide markdown text as input.");
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405).end("Method not allowed");
      return;
    }

    const store = await fetch(STORE_URL + "/p/" + id);

    if (store.status !== 200) {
      notFound(response);
      return;
    }

    const json = await store.json();
    renderPage(response, json.content);
    return;
  }

  if (url.pathname.startsWith("/api/v1/g/")) {
    if (request.method !== "GET") {
      response.writeHead(405).end("Method not allowed");
      return;
    }

    const [org, repo, ref = "main", ...pathParts] = url.pathname.replace("/api/v1/g/", "").split("/");
    const path = pathParts.length ? pathParts.join("/") : "README.md";

    const remote = await fetch(`https://raw.githubusercontent.com/${org}/${repo}/${ref}/${path}`);

    if (remote.status !== 200) {
      notFound(response);
      return;
    }

    const entry = await remote.text();
    renderPage(response, entry);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/p") {
    const body = await readStream(request);

    if (body === null) {
      response.writeHead(413).end("Payload too large");
      return;
    }

    if (body.trim()) {
      const uid = randomUUID();
      await storePage(uid, body.trim());
      sendPageResponse(response, uid, request.headers["x-forwarded-host"]);
      return;
    }

    response.writeHead(400).end("Bad request. Provide markdown text as input.");
    return;
  }

  notFound(response);
});

function sendPageResponse(response, uid, domain) {
  response.writeHead(201, {
    location: "/api/v1/p/" + uid,
    "content-type": "application/json",
  });
  const pageUrl = new URL("/api/v1/p/" + uid, "https://" + domain);
  response.end(JSON.stringify({ id: uid, url: pageUrl.toString() }));
}

async function renderPage(response, content) {
  response.writeHead(200, {
    "content-type": "text/html",
    "cache-control": "public, max-age=86400",
  });

  const [meta] = parseMetadata(content);

  response.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
${meta.title ? "<title>" + meta.title + "</title>" : ""}
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" />
<link rel="stylesheet" href="https://unpkg.com/@tailwindcss/typography@0.5.0/dist/typography.min.css" />
</head><body class="p-8"><article class="max-w-3xl mx-auto prose lg:prose-xl dark:prose-dark">`);

  const markdown = new MarkdownIt("default", {});

  response.write(markdown.render(content));
  response.end("</article></body></html>");
}

async function storePage(uid, content) {
  await fetch(STORE_URL + "/p/" + uid, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

function notFound(response) {
  response.writeHead(404).end("Not found");
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const all = [];
    let size = 0;
    stream.on("data", (c) => {
      size += c.length;
      if (size > MAX_PAYLOAD_BYTES) {
        all.length = 0;
        stream.removeAllListeners("data");
        stream.resume();
        resolve(null);
        return;
      }
      all.push(c);
    });
    stream.on("end", () => resolve(Buffer.concat(all).toString("utf8")));
    stream.on("error", reject);
  });
}

function parseMetadata(text) {
  text = text.trim();

  if (text.startsWith("---")) {
    text = text.slice(3);
  }

  if (text.indexOf("---") === -1) {
    return [{}, text];
  }

  const [meta, remainingText] = text.split("---");
  const fm = Object.fromEntries(
    meta
      .split("\n")
      .filter((s) => s.trim())
      .map((line) => {
        const [left, right] = line.trim().split(":");
        return [String(left).trim(), String(right || "").trim()];
      }),
  );

  return [fm, (remainingText || "").trim()];
}
