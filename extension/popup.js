const BRIEF_PREVIEW_LEN = 800;

function wikiGetStorage() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
  } catch {
    return null;
  }
  return null;
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = text;
  }
}

function showView(viewName) {
  const main = document.getElementById("mainView");
  const about = document.getElementById("aboutView");
  const settings = document.getElementById("settingsView");
  if (!main || !about || !settings) return;
  main.classList.toggle("hidden", viewName !== "main");
  about.classList.toggle("hidden", viewName !== "about");
  settings.classList.toggle("hidden", viewName !== "settings");
}

async function loadSettingsView() {
  const st = wikiGetStorage();
  const msgEl = document.getElementById("settingsMsg");
  const baseEl = document.getElementById("settingsBase");
  const keyEl = document.getElementById("settingsKey");
  if (!st || !baseEl || !keyEl || !msgEl) {
    return;
  }
  const { bridgeBase = "", bridgeApiKey = "" } = await st.get([
    "bridgeBase",
    "bridgeApiKey",
  ]);
  baseEl.value = bridgeBase || "";
  keyEl.value = bridgeApiKey || "";
  msgEl.textContent = "";
}

async function saveSettingsFromView() {
  const st = wikiGetStorage();
  const msgEl = document.getElementById("settingsMsg");
  const baseEl = document.getElementById("settingsBase");
  const keyEl = document.getElementById("settingsKey");
  if (!st || !baseEl || !keyEl || !msgEl) {
    return;
  }
  const base = baseEl.value.trim();
  const key = keyEl.value.trim();
  if (!base || !key) {
    msgEl.textContent = "bridge 地址和 X-API-Key 都必须填写。";
    return;
  }
  await st.set({ bridgeBase: base, bridgeApiKey: key });
  msgEl.textContent = "已保存";
}

function formatBytes(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) {
    return "0 B";
  }
  if (num < 1024) {
    return `${Math.round(num)} B`;
  }
  if (num < 1024 * 1024) {
    return `${(num / 1024).toFixed(1)} KB`;
  }
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

async function refreshDbStats() {
  const countEl = document.getElementById("dbCount");
  const usageEl = document.getElementById("dbUsage");
  if (!countEl || !usageEl) {
    return;
  }
  try {
    const { listMaterials } = await import("./idb.js");
    const items = await listMaterials({ limit: 100000 });
    countEl.textContent = String(items.length);

    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usageEl.textContent = `占用估算：${formatBytes(est.usage)} / 配额 ${formatBytes(est.quota)}`;
    } else {
      usageEl.textContent = "占用估算：不可用";
    }
  } catch (e) {
    countEl.textContent = "--";
    usageEl.textContent = `占用估算：${String(e)}`;
  }
}


/**
 * 多方案正文抓取：按站点启用专项策略，其余并行打分择优，最后 full_body 兜底。
 * 必须自包含（无闭包），供 chrome.scripting.executeScript 序列化注入。
 */
function extractPageMultiStrategy() {
  const hostname = window.location.hostname || "";
  const pathname = window.location.pathname || "";
  const href = window.location.href || "";
  const title = document.title || "";

  function norm(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function metaBrief() {
    const metaDesc = document.querySelector('meta[name="description"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    return (
      (metaDesc && metaDesc.content && metaDesc.content.trim()) ||
      (ogDesc && ogDesc.content && ogDesc.content.trim()) ||
      (twDesc && twDesc.content && twDesc.content.trim()) ||
      ""
    );
  }

  function selBrief() {
    return norm(window.getSelection().toString());
  }

  const strategies = [];

  function add(id, weight, run) {
    strategies.push({ id, weight, run });
  }

  if (/mp\.weixin\.qq\.com$/i.test(hostname)) {
    add("wechat_js_content", 220, function wechatBody() {
      const el =
        document.querySelector("#js_content") ||
        document.querySelector(".rich_media_content") ||
        document.querySelector("#img-content");
      return el ? norm(el.innerText) : "";
    });
  }

  if (/zhihu\.com$/i.test(hostname)) {
    add("zhihu_article", 200, function zhihu() {
      const el =
        document.querySelector(".RichText.ztext") ||
        document.querySelector("article") ||
        document.querySelector('[itemprop="articleBody"]');
      return el ? norm(el.innerText) : "";
    });
  }

  if (/wikipedia\.org$/i.test(hostname)) {
    add("wikipedia", 200, function wiki() {
      const el =
        document.querySelector("#mw-content-text .mw-parser-output") ||
        document.querySelector("#mw-content-text");
      return el ? norm(el.innerText) : "";
    });
  }

  if (/github\.com$/i.test(hostname) && /\/blob\//.test(pathname)) {
    add("github_markdown", 200, function gh() {
      const el =
        document.querySelector("article.markdown-body") ||
        document.querySelector(".blob-wrapper .markdown-body");
      return el ? norm(el.innerText) : "";
    });
  }

  if (/substack\.com$/i.test(hostname)) {
    add("substack_post", 190, function sub() {
      const el =
        document.querySelector(".available-content") ||
        document.querySelector(".markup") ||
        document.querySelector(".post");
      return el ? norm(el.innerText) : "";
    });
  }

  if (/medium\.com$/i.test(hostname) || hostname.endsWith(".medium.com")) {
    add("medium_article", 190, function mediumFn() {
      const el =
        document.querySelector("article") ||
        document.querySelector('[data-testid="storyBody"]');
      return el ? norm(el.innerText) : "";
    });
  }

  add("semantic_html", 120, function semantic() {
    const selectors = [
      '[itemprop="articleBody"]',
      "article",
      '[role="article"]',
      "main",
    ];
    let best = "";
    for (let i = 0; i < selectors.length; i++) {
      const el = document.querySelector(selectors[i]);
      const t = el ? norm(el.innerText) : "";
      if (t.length > best.length) {
        best = t;
      }
    }
    return best;
  });

  add("cms_selectors", 100, function cms() {
    const selectors = [
      ".post-content",
      ".entry-content",
      ".article-content",
      ".markdown-body",
      ".note-content",
      ".Post-RichText",
      ".c-article__body",
      ".article-body",
      ".rich_media_area_primary",
      ".singapore-print",
    ];
    let best = "";
    for (let i = 0; i < selectors.length; i++) {
      const el = document.querySelector(selectors[i]);
      const t = el ? norm(el.innerText) : "";
      if (t.length > best.length) {
        best = t;
      }
    }
    return best;
  });

  add("largest_block", 60, function largest() {
    const badClass =
      /nav|footer|header|sidebar|comment|menu|cookie|banner|subscribe|related/i;
    let best = "";
    const nodes = document.querySelectorAll("article, section, div");
    const limit = Math.min(nodes.length, 500);
    for (let i = 0; i < limit; i++) {
      const n = nodes[i];
      if (!n) {
        continue;
      }
      const tag = n.tagName;
      if (/^(NAV|FOOTER|HEADER|ASIDE|SCRIPT|STYLE)$/i.test(tag)) {
        continue;
      }
      if (
        n.closest(
          "nav, footer, header, aside, [role='navigation'], [role='banner']",
        )
      ) {
        continue;
      }
      const cls = n.className && String(n.className);
      if (cls && badClass.test(cls)) {
        continue;
      }
      const t = norm(n.innerText);
      if (t.length > best.length && t.length > 120) {
        best = t;
      }
    }
    return best;
  });

  add("full_body", 20, function bodyFn() {
    return document.body ? norm(document.body.innerText) : "";
  });

  let bestText = "";
  let bestId = "none";
  let bestRank = -1;

  for (let i = 0; i < strategies.length; i++) {
    const s = strategies[i];
    let t = "";
    try {
      t = s.run();
    } catch {
      t = "";
    }
    if (!t) {
      continue;
    }
    const len = t.length;
    let rank = len * 1000 + s.weight;
    if (len < 40) {
      rank *= 0.35;
    }
    if (s.id === "full_body" && len > 12000) {
      rank -= 150000;
    }
    if (rank > bestRank) {
      bestRank = rank;
      bestText = t;
      bestId = s.id;
    }
  }

  const mb = metaBrief();
  const sb = selBrief();
  const briefFromMeta = sb || mb;
  const previewCap = 800;
  const preview =
    bestText.length > previewCap
      ? bestText.slice(0, previewCap) + "…"
      : bestText;
  const brief =
    briefFromMeta ||
    (bestText ? preview : "");

  return {
    title,
    url: href,
    brief,
    pageText: bestText.slice(0, 16000),
    strategy: bestId,
    quality: Math.round(bestRank),
  };
}

function pickBestExtract(injectResults) {
  let best = null;
  for (const item of injectResults || []) {
    const r = item && item.result;
    if (!r) {
      continue;
    }
    const len = (r.pageText || "").length;
    const prevLen = best ? (best.pageText || "").length : -1;
    const rq = Number(r.quality) || 0;
    const bq = best ? Number(best.quality) || 0 : -1;
    if (len > prevLen || (len === prevLen && rq > bq)) {
      best = r;
    }
  }
  return (
    best || {
      title: "",
      url: "",
      brief: "",
      pageText: "",
      strategy: "none",
      quality: 0,
    }
  );
}

function briefPreviewFromPageText(pageText) {
  const t = String(pageText || "").trim();
  if (!t) {
    return "";
  }
  if (t.length <= BRIEF_PREVIEW_LEN) {
    return t;
  }
  return t.slice(0, BRIEF_PREVIEW_LEN) + "…";
}

async function injectExtract(tabId) {
  let injectResults;
  try {
    injectResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: extractPageMultiStrategy,
    });
  } catch {
    injectResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageMultiStrategy,
    });
  }
  return pickBestExtract(injectResults);
}

async function getBridgeConfig() {
  const st = wikiGetStorage();
  if (!st) {
    return { base: "", apiKey: "" };
  }
  const { bridgeBase = "", bridgeApiKey = "" } = await st.get([
    "bridgeBase",
    "bridgeApiKey",
  ]);
  const base = String(bridgeBase || "").trim().replace(/\/$/, "");
  return { base, apiKey: bridgeApiKey || "" };
}

async function loadFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("无法读取当前标签页。");
      return;
    }

    setStatus("正在多方案抓取正文…");
    const result = await injectExtract(tab.id);

    document.getElementById("title").value = result.title || "";
    document.getElementById("url").value = result.url || tab.url || "";

    let briefVal = (result.brief || "").trim();
    if (!briefVal && result.pageText) {
      briefVal = briefPreviewFromPageText(result.pageText);
    }
    document.getElementById("brief").value = briefVal;

    const n = (result.pageText || "").length;
    const strat = result.strategy || "unknown";
    if (n < 30) {
      setStatus(
        `抓取完成「${strat}」，正文约 ${n} 字，可能仍被页面结构挡住。\n` +
          "可滚动等正文加载完再试，或在页内选中一段后点「重新抓取」。",
      );
    } else {
      setStatus(
        `抓取完成「${strat}」· 正文约 ${n} 字 · 摘要框为预览可删改。\n可点「AI 摘要与标签」。`,
      );
    }
  } catch (e) {
    setStatus(
      "无法注入页面读取标题/正文（可能为 chrome:// 或限制页）。\n" +
        String(e),
    );
  }
}

async function runAiSummarize() {
  const { base, apiKey } = await getBridgeConfig();
  if (!base || !apiKey) {
    setStatus("请先在「设置」里填写 bridge 地址与 X-API-Key。");
    await loadSettingsView();
    showView("settings");
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("无法读取当前标签页。");
      return;
    }

    setStatus("正在多方案抓取正文并请求本机 LLM…");
    const result = await injectExtract(tab.id);

    const title = (result.title || document.getElementById("title").value || "").trim();
    const url = (result.url || document.getElementById("url").value || "").trim();
    const text = (result.pageText || "").trim();

    if (!text || text.length < 30) {
      setStatus(
        `正文过短（方案「${result.strategy || "?"}」约 ${text.length} 字），无法调用 LLM。\n` +
          "请等页面加载完或选中一段文字后，先「重新抓取」再点 AI。",
      );
      return;
    }

    const res = await fetch(`${base}/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ title, url, text }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let hint = "";
      if (res.status === 401) {
        hint =
          "\n\n【401】这是本机 bridge 口令不对：扩展选项里的 X-API-Key 必须和 .env 的 WIKI_BRIDGE_API_KEY 完全一致（不要填 sk-）。打开「连接设置」粘贴保存。";
      } else if (res.status === 501) {
        hint =
          "\n\n【501】服务端未配置 LLM：在 .env 填 OPENAI_API_KEY（DeepSeek 的 sk-），重启 npm run server。";
      } else if (res.status === 502) {
        hint =
          "\n\n【502】LLM 调用失败：检查 OPENAI_BASE_URL / OPENAI_MODEL 与 DeepSeek 账户。";
      }
      setStatus(
        `AI 失败 (${res.status}): ${data?.detail ?? data?.error ?? JSON.stringify(data)}${hint}`,
      );
      return;
    }

    const brief = String(data.brief ?? "").trim();
    const keywords = String(data.keywords ?? "").trim();
    if (brief) {
      document.getElementById("brief").value = brief;
    }
    if (keywords) {
      document.getElementById("keywords").value = keywords;
    }
    setStatus(
      `AI 已写入摘要与关键词（抓取方案：${result.strategy || "?"}）。可再改后点「保存」。`,
    );
  } catch (e) {
    setStatus(
      `请求本机 bridge 失败：${String(e)}\n请确认服务已启动、端口一致，且扩展可访问 127.0.0.1。`,
    );
  }
}

async function saveMaterial() {
  const { base, apiKey } = await getBridgeConfig();
  if (!base || !apiKey) {
    setStatus("请先在「设置」里填写 bridge 地址与 X-API-Key。");
    await loadSettingsView();
    showView("settings");
    return;
  }

  const payload = {
    id: crypto?.randomUUID ? crypto.randomUUID() : undefined,
    title: document.getElementById("title").value.trim(),
    url: document.getElementById("url").value.trim(),
    brief: document.getElementById("brief").value.trim(),
    keywords: document.getElementById("keywords").value.trim(),
    savedAt: new Date().toISOString(),
    syncSt: "pending",
  };

  if (!payload.url) {
    setStatus("链接为空，无法保存。");
    return;
  }

  setStatus("正在写入 IndexedDB 并同步到本机 bridge…");
  try {
    const { putMaterial, updateMaterialSync } = await import("./idb.js");
    await putMaterial(payload);

    const res = await fetch(`${base}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ items: [payload] }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let hint = "";
      if (res.status === 401) {
        hint =
          "\n\n【401】X-API-Key 与 .env 的 WIKI_BRIDGE_API_KEY 须完全一致（不要填 sk-）。打开「连接设置」粘贴保存。";
      }
      setStatus(
        `已写入 IndexedDB，但同步到本机失败（${res.status}）：${data?.error ?? data?.detail ?? JSON.stringify(data)}\n` +
          `同步接口：POST ${base}/sync${hint}`,
      );
      await updateMaterialSync(payload.id, { syncSt: "failed" });
      return;
    }

    if (data?.ok) {
      await updateMaterialSync(payload.id, { syncSt: "ok", syncAt: new Date().toISOString() });
      setStatus(
        `已保存。id=${payload.id ?? ""}\n主存储：插件 IndexedDB；已同步到本机，OpenClaw 可走 bridge 检索。`,
      );
      await refreshDbStats();
    } else {
      setStatus(`保存失败：${data?.error ?? JSON.stringify(data)}`);
      await updateMaterialSync(payload.id, { syncSt: "failed" });
      await refreshDbStats();
    }
  } catch (e) {
    setStatus(
      `已写入 IndexedDB，但请求本机同步失败：${String(e)}\n` +
        "请先在本项目目录执行 npm run server，并核对 Bridge 地址与端口。",
    );
    try {
      const { updateMaterialSync } = await import("./idb.js");
      await updateMaterialSync(payload.id, { syncSt: "failed" });
      await refreshDbStats();
    } catch {
      // ignore
    }
  }
}

function bindUi() {
  document.getElementById("ai").addEventListener("click", () => {
    void runAiSummarize();
  });

  document.getElementById("save").addEventListener("click", () => {
    void saveMaterial();
  });
  document.getElementById("clearDb").addEventListener("click", async () => {
    const ok = window.confirm("确认清空插件 IndexedDB 吗？\n仅删除插件本地数据，不影响本机 bridge 已同步数据。");
    if (!ok) return;
    try {
      const { clearMaterials } = await import("./idb.js");
      await clearMaterials();
      setStatus("已清空 IndexedDB（本机 bridge 数据不受影响）。");
      await refreshDbStats();
    } catch (e) {
      setStatus(`清空失败：${String(e)}`);
    }
  });

  document.getElementById("optsBtn").addEventListener("click", () => {
    void (async () => {
      await loadSettingsView();
      showView("settings");
    })();
  });

  document.getElementById("helpBtn").addEventListener("click", () => {
    showView("about");
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    showView("main");
  });
  document.getElementById("settingsBackBtn").addEventListener("click", () => {
    showView("main");
  });
  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    void saveSettingsFromView();
  });
}

bindUi();
void loadFromTab();
void refreshDbStats();
