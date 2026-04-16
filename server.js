const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_LOGIN_URL = "https://www.summitk12.com/login";
const LAUNCH_WINDOW_MS = 60_000;
const LAUNCH_MAX_REQUESTS = 60;
const launchRequestBuckets = new Map();

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
    return { filePath: path.join(PUBLIC_DIR, "index.html") };
  }

  try {
    const decoded = decodeURIComponent(urlPathname).replace(/^[/\\]+/, "");
    const segments = decoded.split(/[/\\]+/).filter(Boolean);
    if (segments.includes("..")) {
      return { error: "Malformed URL path." };
    }
    return { filePath: path.resolve(PUBLIC_DIR, decoded) };
  } catch {
    return { error: "Malformed URL path." };
  }
}

function isLaunchRequestAllowed(clientKey) {
  const now = Date.now();
  const existing = launchRequestBuckets.get(clientKey);
  if (!existing || now - existing.windowStart > LAUNCH_WINDOW_MS) {
    launchRequestBuckets.set(clientKey, { windowStart: now, count: 1 });
    return true;
  }

  existing.count += 1;
  return existing.count <= LAUNCH_MAX_REQUESTS;
}

function isSafeRedirectTarget(value) {
  try {
    const parsed = new URL(value);
    const targetHost = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (targetHost === "summitk12.com" || targetHost.endsWith(".summitk12.com"))
    );
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/launch") {
    const clientKey = req.socket.remoteAddress || "unknown";
    if (!isLaunchRequestAllowed(clientKey)) {
      res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Too many requests. Please try again later.");
      return;
    }

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

  const pathResult = resolveRequestedPath(requestUrl.pathname);
  if (pathResult.error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(pathResult.error);
    return;
  }

  const { filePath } = pathResult;
  const normalizedPublicDir = path.resolve(PUBLIC_DIR);
  const normalizedFilePath = path.resolve(filePath);
  const withinPublicDir =
    normalizedFilePath === normalizedPublicDir ||
    normalizedFilePath.startsWith(`${normalizedPublicDir}${path.sep}`);
  if (!withinPublicDir) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Summit launcher is running at http://${HOST}:${PORT}`);
});
