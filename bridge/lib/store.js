import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { ensureDataDir, materialsPath } from "./paths.js";

export function appendMaterial(record) {
  ensureDataDir();
  const line = JSON.stringify(record) + "\n";
  fs.appendFileSync(materialsPath(), line, "utf8");
}

export function readAllMaterials() {
  ensureDataDir();
  const p = materialsPath();
  if (!fs.existsSync(p)) {
    return [];
  }
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) {
    return [];
  }
  const items = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      items.push(JSON.parse(line));
    } catch {
      /* skip corrupt line */
    }
  }
  return items;
}

export function savePayloadToStore(payload) {
  const now = new Date().toISOString();
  const rec = {
    id: payload.id ?? randomUUID(),
    url: String(payload.url ?? ""),
    title: String(payload.title ?? ""),
    brief: String(payload.brief ?? ""),
    keywords: String(payload.keywords ?? ""),
    savedAt: payload.savedAt ?? now,
  };
  appendMaterial(rec);
  return rec;
}
