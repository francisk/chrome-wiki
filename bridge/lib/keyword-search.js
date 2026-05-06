/**
 * 轻量关键词检索：对 title / brief / url / keywords 做分词重叠打分。
 */

const SPLIT_RE = /[\s\u3000,/|.;:!?，。；：！？、'"()[\]{}<>«»“”]+/;

function normToken(t) {
  const s = t.trim().toLowerCase();
  return s.length === 0 ? null : s;
}

export function tokenize(text) {
  if (!text) {
    return [];
  }
  const parts = String(text).split(SPLIT_RE);
  const out = [];
  for (const p of parts) {
    const n = normToken(p);
    if (n) {
      out.push(n);
    }
  }
  return out;
}

export function uniqTokens(tokens) {
  return [...new Set(tokens)];
}

function scoreDoc(queryTokens, doc) {
  const blob = [doc.title, doc.brief, doc.url, doc.keywords].join("\n");
  const lower = blob.toLowerCase();
  let score = 0;
  for (const qt of queryTokens) {
    if (qt.length <= 1) {
      continue;
    }
    if (lower.includes(qt)) {
      score += 2;
    }
  }
  const docTokens = uniqTokens(tokenize(blob));
  const set = new Set(docTokens);
  for (const qt of queryTokens) {
    if (set.has(qt)) {
      score += 3;
    }
  }
  return score;
}

export function searchMaterials(materials, query, limit) {
  const qRaw = String(query ?? "").trim();
  if (!qRaw) {
    return materials.slice(-limit).reverse();
  }
  const queryTokens = uniqTokens(tokenize(qRaw));
  if (queryTokens.length === 0) {
    return materials.slice(-limit).reverse();
  }
  const scored = materials
    .map((m) => ({ m, s: scoreDoc(queryTokens, m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || String(b.m.savedAt).localeCompare(String(a.m.savedAt)));
  return scored.slice(0, limit).map((x) => x.m);
}
