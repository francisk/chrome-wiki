import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_DIR = process.env.WIKI_DATA_DIR
  ? path.resolve(String(process.env.WIKI_DATA_DIR))
  : path.join(os.homedir(), ".chrome-plugin-wiki");

export function materialsPath() {
  return path.join(DATA_DIR, "materials.jsonl");
}

export function dataDir() {
  return DATA_DIR;
}

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
