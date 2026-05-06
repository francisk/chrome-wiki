/**
 * POST /save 请求体验证（与扩展 popup 提交的字段一致）。
 */

export function parseMaterialSaveBody(body) {
  if (!body || typeof body !== "object") {
    return { error: "invalid_body" };
  }
  const url = String(body.url ?? "").trim();
  if (!url) {
    return { error: "url_required" };
  }
  return {
    payload: {
      url,
      title: String(body.title ?? ""),
      brief: String(body.brief ?? ""),
      keywords: String(body.keywords ?? ""),
    },
  };
}
