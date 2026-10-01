// AI Painter photobooth – minimale server zonder dependencies (Node 18+).
// Serveert de webapp uit /public en zet een foto via de OpenAI image-edit API om in een schilderij.
// Zonder OPENAI_API_KEY valt de app terug op een lokaal "olieverf"-filter in de browser.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const PROMPT =
  process.env.PAINT_PROMPT ||
  "Turn this photo into an expressive oil painting on canvas, visible brush strokes, rich colours, " +
    "painted by a master painter. Keep the person's face, pose and likeness clearly recognisable.";

const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body te groot"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function paint(req, res) {
  if (!API_KEY) return sendJson(res, 503, { error: "Geen OPENAI_API_KEY ingesteld" });

  const { image } = JSON.parse((await readBody(req)).toString());
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(image || "");
  if (!match) return sendJson(res, 400, { error: "Ongeldige afbeelding" });

  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", PROMPT);
  form.append("size", "1024x1024");
  form.append(
    "image",
    new Blob([Buffer.from(match[2], "base64")], { type: `image/${match[1]}` }),
    `photo.${match[1] === "png" ? "png" : "jpg"}`
  );

  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  const data = await r.json();
  if (!r.ok) {
    console.error("OpenAI fout:", data);
    return sendJson(res, 502, { error: data.error?.message || "AI-fout" });
  }
  sendJson(res, 200, { image: `data:image/png;base64,${data.data[0].b64_json}` });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Verboden" });

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: "Niet gevonden" });
    const type = MIME[path.extname(file)] || "application/octet-stream";

    // Range-requests zodat de video netjes streamt (nodig voor Safari).
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
  });
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/api/config") return sendJson(res, 200, { ai: !!API_KEY });
      if (req.method === "POST" && req.url === "/api/paint") return await paint(req, res);
      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
      sendJson(res, 405, { error: "Methode niet toegestaan" });
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { error: e.message });
    }
  })
  .listen(PORT, () => {
    console.log(`AI Painter draait op http://localhost:${PORT} (AI ${API_KEY ? `aan, model ${MODEL}` : "uit – demo-filter"})`);
  });
