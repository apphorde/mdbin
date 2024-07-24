import createServer from "@cloud-cli/http";
import MarkdownIt from "markdown-it";
import { randomUUID } from "node:crypto";

const { STORE_URL, HOMEPAGE_ID } = process.env;

createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  if (url.pathname === "/") {
    response.writeHead(302, { Location: "/p/" + HOMEPAGE_ID });
    response.end();
    return;
  }

  if (url.pathname.startsWith("/p/")) {
    const id = url.pathname.replace("/p/", "");
    const store = await fetch(STORE_URL + "/p/" + id);

    if (store.status !== 200) {
      notFound(response);
      return;
    }

    const json = await store.json();
    renderPage(response, json.content);
    return;
  }

  if (url.pathname.startsWith("/g/")) {
    const [org, repo, path = "README.md"] = url.pathname
      .replace("/g/", "")
      .split("/");

    const remote = await fetch(
      `https://raw.githubusercontent.com/${org}/${repo}/main/${path}`
    );

    if (remote.status !== 200) {
      notFound(response);
      return;
    }

    const entry = await remote.text();
    renderPage(response, entry);
    return;
  }

  if (request.method === "POST" && url.pathname === "/p") {
    const body = await readStream(request);

    if (body.trim()) {
      const uid = randomUUID();
      await storePage(uid, body.trim());
      sendPageResponse(response, uid, request.headers["x-forwarded-for"]);
      return;
    }

    response.writeHead(400).end("Bad request. Provide markdown text as input.");
    return;
  }

  if (request.method === "PUT" && url.pathname.startsWith("/p/")) {
    const uid = url.pathname.replace("/p/", "");
    const body = await readStream(request);

    if (body.trim()) {
      await storePage(uid, body.trim());
      sendPageResponse(response, uid, request.headers["x-forwarded-for"]);
      return;
    }

    response.writeHead(400).end("Bad request. Provide markdown text as input.");
    return;
  }

  notFound(response);
});

function sendPageResponse(response, uid, domain) {
  response.writeHead(201, {
    location: "/p/" + uid,
    "content-type": "application/json",
  });
  const pageUrl = new URL("/p/" + uid, "https://" + domain);
  response.end(JSON.stringify({ id: uid, url: pageUrl.toString() }));
}

async function renderPage(response, content) {
  response.writeHead(200, {
    "content-type": "text/html",
    "cache-control": "public, max-age=86400",
  });

  const [meta, text] = parseMetadata(content);

  response.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
${meta.title ? '<title>' + meta.title + '</title>' : ''}
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" />
<link rel="stylesheet" href="https://unpkg.com/@tailwindcss/typography@0.5.0/dist/typography.min.css" />
</head><body><article class="max-w-3xl mx-auto prose lg:prose-xl dark:prose-dark">`);

  const markdown = new MarkdownIt("default", {});

  response.write(markdown.render(content));
  response.end('</article></body></html>');
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
    stream.on("data", (c) => all.push(c));
    stream.on("end", () => resolve(Buffer.concat(all).toString("utf8")));
    stream.on("error", reject);
  });
}

function parseMetadata(text) {
  text = text.trim();

  if (text.startsWith('---')) {
    text = text.slice(3);
  }

  if (text.indexOf('---') === -1) {
    return [{}, text];
  }

  const [meta, remainingText] = text.split('---');
  const fm = Object.fromEntries(
    meta.split('\n').filter(s => s.trim()).map(line => {
      const [left, right] = line.trim().split(':');
      return [left.trim(), right.trim()];
    })
  );

  return [fm, (remainingText || '').trim()];
}
