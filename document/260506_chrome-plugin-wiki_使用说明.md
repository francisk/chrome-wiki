# Chrome Plugin Wiki — 使用说明（本地素材本 + OpenClaw）

生成日期参考文件名：`260506`。

## 你要的两件事

1. **扩展**：保存当前页「标题 / 链接 / 摘要 / 可选关键词」到本机 `~/.chrome-plugin-wiki/materials.jsonl`（经本机 **`POST /save`**，与 AI 摘要共用 wiki-bridge，不经云端）。
2. **HTTP API**（单独进程）：扩展写库、OpenClaw / Agent 检索，请求均需带 **`X-API-Key`**。

## 架构说明

- **wiki-bridge**（`node bridge/server.js`）：长期监听 `127.0.0.1`，负责 `POST /save` 追加 JSONL、`GET /search` / `GET /list` 检索、`POST /summarize` 调 LLM。扩展保存前须已启动该进程。
- 仓库里仍保留 `bridge/native-host.js` 等 **Native Messaging** 实现，仅供旧方案参考；**当前扩展默认不再使用**。

## 环境与密钥

```bash
cd /path/to/chrome-plugin-wiki
cp .env.example .env
# 编辑 .env：设置 WIKI_BRIDGE_API_KEY；若用「AI 摘要与标签」，再设 OPENAI_API_KEY（及可选 OPENAI_BASE_URL / OPENAI_MODEL）
```

启动检索服务：

```bash
node bridge/server.js
# 或 npm run serve / npm run server（二者相同）
```

健康检查：

```bash
curl -s -H "X-API-Key: 你的密钥" "http://127.0.0.1:3456/health"
```

检索（RAG 上下文素材）：

```bash
curl -s -H "X-API-Key: 你的密钥" \
  "http://127.0.0.1:3456/search?q=RAG&limit=10"
```

列出最近条目：

```bash
curl -s -H "X-API-Key: 你的密钥" "http://127.0.0.1:3456/list?limit=50"
```

写入一条素材（与扩展「保存」等价，JSON 字段：`url` 必填，`title` / `brief` / `keywords` 可选）：

```bash
curl -s -X POST -H "X-API-Key: 你的密钥" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/a","title":"示例","brief":"","keywords":""}' \
  "http://127.0.0.1:3456/save"
```

## AI 摘要与标签（可选）

1. 在 `.env` 中配置 `OPENAI_API_KEY`（及按需 `OPENAI_BASE_URL`、`OPENAI_MODEL`），**重启** `npm run server`。
2. 在扩展右键菜单或 `chrome://extensions` 中打开 **扩展选项**，填写与 `.env` 一致的 **X-API-Key** 与 **Bridge 地址**（默认 `http://127.0.0.1:3456`）。
3. 在正文页打开弹窗 → 点 **「AI 摘要与标签」**：正文会发到本机 `POST /summarize`，由服务端调 LLM，返回的摘要与关键词会填入表单（仍需你确认后再 **保存**）。
4. 点 **「保存」**：扩展请求本机 **`POST /save`**；若失败，请确认 **`npm run server` 已运行** 且密钥一致。
5. 微信公众号正文会优先读取 `#js_content`；若仍提示正文过短，可在页面上选中一段再点 AI。

## 安装 Chrome 扩展

1. 打开 `chrome://extensions`，开启「开发者模式」，**加载已解压的扩展**，选本仓库下的 `extension/` 目录。
2. 打开 **扩展选项**，填写 **X-API-Key**（与 `.env` 的 `WIKI_BRIDGE_API_KEY` 相同）和 **Bridge 地址**。
3. 在本机启动 `npm run server` 后，在网页上打开弹窗即可 **保存** 或 **AI 摘要**。

若保存失败：先看弹窗里的 HTTP 状态码与提示；常见原因是 bridge 未启动或 **401**（密钥不一致）。

## C 方案补充（你曾问是否要手导）

- **是**：C 一般要在扩展里点「导出」或定时导出快照；Agent 读的是文件快照，不是实时库。
- 当前实现为 **B + 共享 JSONL**，保存后只要 `server.js` 在跑，检索即最新。

## OpenClaw skill 示例

HTTP 一步：`GET http://127.0.0.1:3456/search?q={{query}}`，Header：`X-API-Key: {{env}}`（密钥放本机环境变量，勿提交仓库）。

## 测试

```bash
npm test
```
