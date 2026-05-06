function oneResult(row) {
  const doc = row?.m ?? row ?? {};
  const score = Number(row?.s ?? 0);
  return {
    id: String(doc.id ?? ""),
    title: String(doc.title ?? ""),
    url: String(doc.url ?? ""),
    brief: String(doc.brief ?? ""),
    keywords: String(doc.keywords ?? ""),
    savedAt: String(doc.savedAt ?? ""),
    score: Number.isFinite(score) ? score : 0,
  };
}

export function toSearchResults(rows) {
  return (rows || []).map(oneResult);
}

