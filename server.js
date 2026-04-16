const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_LOGIN_URL = "https://www.summitk12.com/login";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function resolveRequestedPath(urlPathname) {
  if (urlPathname === "/") {
    return path.join(PUBLIC_DIR, "index.html");
  }

  const decoded = decodeURIComponent(urlPathname).replace(/^[/\\]+/, "");
  return path.resolve(PUBLIC_DIR, decoded);
}

function isSafeRedirectTarget(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (host === "summitk12.com" || host.endsWith(".summitk12.com"))
    );
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/launch") {
    const target = requestUrl.searchParams.get("target") || DEFAULT_LOGIN_URL;
    if (!isSafeRedirectTarget(target)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Invalid URL. Only HTTPS URLs on summitk12.com are allowed.");
      return;
    }

    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  const filePath = resolveRequestedPath(requestUrl.pathname);
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Summit launcher is running at http://${HOST}:${PORT}`);
});
