const MAX_SUGGEST = 5;

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

function trimSuggestText(s, max = 90) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}...`;
}

async function searchByOmnibox(text) {
  const q = String(text ?? "").trim();
  if (!q) {
    return { query: "", results: [] };
  }
  const { base, apiKey } = await getBridgeConfig();
  if (!base) {
    return { query: q, error: "missing_bridge_base", results: [] };
  }
  if (!apiKey) {
    return { query: q, error: "missing_api_key", results: [] };
  }

  const url = new URL(`${base}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(MAX_SUGGEST));

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": apiKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      query: q,
      error: data?.error || data?.detail || `http_${res.status}`,
      results: [],
    };
  }
  return {
    query: q,
    results: Array.isArray(data?.results) ? data.results : [],
  };
}

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  void (async () => {
    const out = await searchByOmnibox(text);
    if (out.error === "missing_bridge_base") {
      suggest([
        {
          content: "__OPEN_SETTINGS__",
          description: "请先在扩展设置中填写 bridge 地址（回车可打开设置）",
        },
      ]);
      return;
    }
    if (out.error === "missing_api_key") {
      suggest([
        {
          content: "__OPEN_SETTINGS__",
          description: "请先在扩展设置中填写 X-API-Key（回车可打开设置）",
        },
      ]);
      return;
    }
    if (out.error) {
      suggest([
        {
          content: "__NO_RESULT__",
          description: `[来自插件] 检索失败：${trimSuggestText(out.error, 60)}`,
        },
      ]);
      return;
    }

    const items = out.results.slice(0, MAX_SUGGEST).map((r) => {
      const title = trimSuggestText(r.title || r.url || "(无标题)", 70);
      const brief = trimSuggestText(r.brief || "", 42);
      return {
        content: String(r.url || ""),
        description: brief
          ? `[来自插件] ${title} — ${brief}`
          : `[来自插件] ${title}`,
      };
    });
    if (items.length === 0) {
      suggest([
        {
          content: "__NO_RESULT__",
          description: `[来自插件] 未命中（${trimSuggestText(text, 30)}）`,
        },
      ]);
      return;
    }
    suggest(items);
  })();
});

chrome.omnibox.onInputEntered.addListener((text) => {
  void (async () => {
    if (text === "__OPEN_SETTINGS__") {
      chrome.runtime.openOptionsPage();
      return;
    }
    if (text === "__NO_RESULT__") {
      return;
    }
    const t = String(text || "").trim();
    if (!t) {
      return;
    }
    const isUrl = /^https?:\/\//i.test(t);
    if (isUrl) {
      chrome.tabs.create({ url: t });
      return;
    }
    const out = await searchByOmnibox(t);
    const first = out.results[0];
    if (first?.url) {
      chrome.tabs.create({ url: String(first.url) });
      return;
    }
    chrome.runtime.openOptionsPage();
  })();
});

