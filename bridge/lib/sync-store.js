import fs from "node:fs";

import { materialsPath } from "./paths.js";
import { readAllMaterials, savePayloadToStore } from "./store.js";

function buildIdSet(items) {
  const s = new Set();
  for (const it of items) {
    if (it && it.id) {
      s.add(String(it.id));
    }
  }
  return s;
}

/**
 * 将扩展侧材料同步到本机素材库（JSONL）。
 * - 以 id 去重：已存在则不重复追加
 * - 返回本次新增条数
 */
export function syncItemsToStore(items) {
  const existing = readAllMaterials();
  const existIds = buildIdSet(existing);

  let added = 0;
  for (const it of items || []) {
    const id = it?.id ? String(it.id) : "";
    if (id && existIds.has(id)) {
      continue;
    }
    savePayloadToStore(it);
    if (id) {
      existIds.add(id);
    }
    added += 1;
  }

  // 保证文件存在（即使 added=0）
  const p = materialsPath();
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, "", "utf8");
  }

  return { ok: true, count: added };
}

