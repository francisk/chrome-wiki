import http from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readAllMaterials, savePayloadToStore } from "./lib/store.js";
import { parseMaterialSaveBody } from "./lib/save-http.js";
import { parseMaterialSyncBody } from "./lib/sync-http.js";
import { syncItemsToStore } from "./lib/sync-store.js";
import { searchMaterialsScored } from "./lib/keyword-search.js";
import { toSearchResults } from "./lib/search-contract.js";
import { summarizeWithLlm } from "./lib/llm-summarize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      continue;
    }
    const eq = t.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

loadDotEnv();

const port = Number(process.env.WIKI_BRIDGE_PORT ?? "3456");
const apiKey = process.env.WIKI_BRIDGE_API_KEY ?? "";

function unauthorized(res) {
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      error: "unauthorized",
      detail:
        "请求头 X-API-Key 与当前进程中的 WIKI_BRIDGE_API_KEY 不一致。请把 .env 里该值复制到扩展选项，保存后重试；改 .env 后需重启 npm run server。",
    }),
  );
}

function badRequest(res, msg) {
  res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: msg }));
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseLimit(s, def, max) {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    return def;
  }
  return Math.min(Math.floor(n), max);
}

function readJsonBody(req, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  if (!apiKey) {
    json(res, 500, {
      error:
        "WIKI_BRIDGE_API_KEY 未设置。请复制 .env.example 为 .env 并填写密钥。",
    });
    return;
  }

  const hdrKey = req.headers["x-api-key"];
  const key = Array.isArray(hdrKey) ? hdrKey[0] : hdrKey;
  if (key !== apiKey) {
    unauthorized(res);
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/search") {
    const q = url.searchParams.get("q") ?? "";
    const limit = parseLimit(url.searchParams.get("limit"), 10, 50);
    const materials = readAllMaterials();
    const results = toSearchResults(searchMaterialsScored(materials, q, limit));
    json(res, 200, {
      query: q,
      count: results.length,
      results,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/list") {
    const limit = parseLimit(url.searchParams.get("limit"), 100, 500);
    const materials = readAllMaterials();
    const results = materials.slice(-limit).reverse();
    json(res, 200, { count: results.length, results });
    return;
  }

  if (req.method === "POST" && url.pathname === "/save") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      if (e.message === "payload_too_large") {
        json(res, 413, { error: "payload_too_large" });
        return;
      }
      badRequest(res, "invalid_json");
      return;
    }

    const parsed = parseMaterialSaveBody(body);
    if (parsed.error) {
      badRequest(res, parsed.error);
      return;
    }

    try {
      const rec = savePayloadToStore(parsed.payload);
      json(res, 200, { ok: true, id: rec.id });
    } catch (e) {
      json(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/sync") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      if (e.message === "payload_too_large") {
        json(res, 413, { error: "payload_too_large" });
        return;
      }
      badRequest(res, "invalid_json");
      return;
    }

    const parsed = parseMaterialSyncBody(body);
    if (parsed.error) {
      badRequest(res, parsed.error);
      return;
    }

    try {
      const out = syncItemsToStore(parsed.items);
      json(res, 200, out);
    } catch (e) {
      json(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/summarize") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      if (e.message === "payload_too_large") {
        json(res, 413, { error: "payload_too_large" });
        return;
      }
      badRequest(res, "invalid_json");
      return;
    }

    const title = String(body.title ?? "");
    const pageUrl = String(body.url ?? "");
    const text = String(body.text ?? "").trim();
    if (!text) {
      badRequest(res, "text_required");
      return;
    }

    try {
      const out = await summarizeWithLlm({
        title,
        url: pageUrl,
        text,
      });
      json(res, 200, out);
      return;
    } catch (e) {
      if (e.code === "openai_key_missing") {
        json(res, 501, {
          error: "openai_key_missing",
          detail: "在 .env 中设置 OPENAI_API_KEY 后重启 npm run server",
        });
        return;
      }
      json(res, 502, {
        error: "llm_failed",
        detail: e instanceof Error ? e.message : String(e),
      });
      return;
    }
  }

  json(res, 404, { error: "not_found" });
}

const server = http.createServer((req, res) => {
  void (async () => {
    try {
      await handle(req, res);
    } catch (e) {
      if (!res.headersSent) {
        json(res, 500, {
          error: "internal",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
  })();
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `端口 ${port} 已被占用（通常是上次未关掉的 wiki-bridge）。\n` +
        `可执行: lsof -nP -iTCP:${port} -sTCP:LISTEN\n` +
        `然后: kill <PID>\n` +
        `或在 .env 里把 WIKI_BRIDGE_PORT 改成其它端口。`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.error(`wiki-bridge 监听 http://127.0.0.1:${port} （需 X-API-Key）`);
});
