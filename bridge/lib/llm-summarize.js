/**
 * 调用 OpenAI 兼容 Chat Completions，生成摘要与关键词（中文）。
 */

const MAX_INPUT_CHARS = 16000;

function truncate(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) {
    return s;
  }
  return s.slice(0, max) + "\n…(已截断)";
}

export function parseBriefKeywordsFromLlmText(raw) {
  const t = String(raw ?? "").trim();
  let inner = t;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    inner = fence[1].trim();
  }
  const parsed = JSON.parse(inner);
  const brief = String(parsed.brief ?? "").trim();
  let keywords = parsed.keywords;
  if (Array.isArray(keywords)) {
    keywords = keywords.map((x) => String(x).trim()).filter(Boolean).join(", ");
  } else {
    keywords = String(keywords ?? "").trim();
  }
  if (!brief) {
    throw new Error("empty_brief");
  }
  return { brief, keywords };
}

export async function summarizeWithLlm({ title, url, text }) {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    const err = new Error("openai_key_missing");
    err.code = "openai_key_missing";
    throw err;
  }

  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const payloadText = truncate(text, MAX_INPUT_CHARS);

  const userBlock = [
    `页面标题: ${title || "(无)"}`,
    `URL: ${url || "(无)"}`,
    "",
    "正文（可能有噪音，请提取要点）:",
    payloadText,
  ].join("\n");

  const systemPrompt = [
    "你是阅读笔记助手。根据下面网页的正文，完成：",
    "1) brief：用中文写 2～5 句话，概括对用户日后检索最有用的信息，避免空话。",
    "2) keywords：3～8 个中文短标签，用英文逗号分隔，不要加#号，不要重复标题原句。",
    '只输出一个 JSON 对象，格式: {"brief":"...","keywords":"标签1, 标签2"}',
    "不要输出其它说明文字。",
  ].join("");

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userBlock },
    ],
    temperature: 0.35,
    response_format: { type: "json_object" },
  };

  let res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  let data = await res.json().catch(() => ({}));
  if (!res.ok && res.status === 400 && data?.error?.message?.includes("response_format")) {
    delete body.response_format;
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok) {
    const msg =
      data?.error?.message ?? data?.error ?? res.statusText ?? "openai_http_error";
    const err = new Error(String(msg));
    err.code = "openai_http_error";
    err.status = res.status;
    throw err;
  }

  const choice = data?.choices?.[0]?.message?.content;
  if (!choice) {
    const err = new Error("openai_empty_choice");
    err.code = "openai_empty_choice";
    throw err;
  }

  try {
    return parseBriefKeywordsFromLlmText(choice);
  } catch {
    const fallbackBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userBlock },
      ],
      temperature: 0.35,
    };
    const res2 = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(fallbackBody),
    });
    const data2 = await res2.json().catch(() => ({}));
    const choice2 = data2?.choices?.[0]?.message?.content;
    if (!choice2) {
      const err = new Error("openai_parse_failed");
      err.code = "openai_parse_failed";
      throw err;
    }
    return parseBriefKeywordsFromLlmText(choice2);
  }
}
