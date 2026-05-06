/**
 * POST /sync 请求体解析（扩展 IndexedDB 同步到本机 bridge）。
 *
 * 支持两种输入：
 * 1) 单条：{ id,url,title,brief,keywords,savedAt,... }
 * 2) 批量：{ items: [ {...}, {...} ] }
 */

function toStr(v) {
  return String(v ?? "");
}

function normUrl(v) {
  return toStr(v).trim();
}

function normalizeItem(it) {
  const url = normUrl(it?.url);
  if (!url) {
    return { error: "url_required" };
  }
  return {
    item: {
      id: it?.id ? toStr(it.id) : undefined,
      url,
      title: toStr(it?.title),
      brief: toStr(it?.brief),
      keywords: toStr(it?.keywords),
      savedAt: it?.savedAt ? toStr(it.savedAt) : undefined,
      syncAt: it?.syncAt ? toStr(it.syncAt) : undefined,
      syncSt: it?.syncSt ? toStr(it.syncSt) : undefined,
    },
  };
}

export function parseMaterialSyncBody(body) {
  if (!body || typeof body !== "object") {
    return { error: "invalid_body" };
  }

  let items = null;
  if (Array.isArray(body.items)) {
    items = body.items;
  } else if (body.url !== undefined) {
    items = [body];
  }

  if (!items || items.length === 0) {
    return { error: "items_required" };
  }

  const out = [];
  for (const it of items) {
    const n = normalizeItem(it);
    if (n.error) {
      return { error: n.error };
    }
    out.push(n.item);
  }
  return { items: out };
}

