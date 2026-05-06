# chrome-plugin-wiki

一个本地优先的 Chrome 扩展 + 本机 HTTP bridge。

当前能力：
- 扩展保存网页素材（标题、链接、摘要、关键词）
- 本机 bridge 提供 `POST /save`、`GET /search`、`GET /list`、`POST /summarize`
- OpenClaw 或其他工具可通过本机 HTTP API 检索素材

> 当前持久化为 `~/.chrome-plugin-wiki/materials.jsonl`。  
> 还没有切到 IndexedDB 持久化。

---

## 1. 环境要求

- Node.js >= 18
- Chrome（开发者模式加载扩展）

---

## 2. 快速开始

### 2.1 安装依赖（如有）

```bash
npm install
```

### 2.2 配置 `.env`

复制示例文件并填写：

```bash
cp .env.example .env
```

关键项：
- `WIKI_BRIDGE_PORT`：本机服务端口，默认 `3456`
- `WIKI_BRIDGE_API_KEY`：bridge 访问口令（随机长串）
- `OPENAI_API_KEY`：用于 `/summarize` 的模型密钥（可选）
- `OPENAI_BASE_URL`、`OPENAI_MODEL`：可选，兼容 DeepSeek/OpenAI

### 2.3 启动本机服务

```bash
npm run server
```

看到类似输出即正常：

```text
wiki-bridge 监听 http://127.0.0.1:3456 （需 X-API-Key）
```

---

## 3. 加载扩展

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目内 `extension/` 目录
5. 打开扩展的「选项页」，填写：
   - Bridge 地址（默认 `http://127.0.0.1:3456`）
   - `X-API-Key`（必须与 `.env` 的 `WIKI_BRIDGE_API_KEY` 一致）

---

## 4. 使用方式

### 4.1 保存素材

在任意网页打开扩展弹窗：
- 点击「重新抓取」可更新标题/链接/摘要
- 点击「保存」会调用本机 `POST /save`

成功会显示返回的 `id`。

### 4.2 AI 摘要与关键词（可选）

点击「AI 摘要与标签」会调用本机 `POST /summarize`。  
需先在 `.env` 中配置 `OPENAI_API_KEY` 并重启 `npm run server`。

---

## 5. API 示例

以下命令都需要带 `X-API-Key`。

### 健康检查

```bash
curl -s -H "X-API-Key: <YOUR_KEY>" "http://127.0.0.1:3456/health"
```

### 保存素材

```bash
curl -s -X POST \
  -H "X-API-Key: <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","title":"示例","brief":"摘要","keywords":"标签"}' \
  "http://127.0.0.1:3456/save"
```

### 检索素材

```bash
curl -s -H "X-API-Key: <YOUR_KEY>" \
  "http://127.0.0.1:3456/search?q=rag&limit=10"
```

### 最近列表

```bash
curl -s -H "X-API-Key: <YOUR_KEY>" \
  "http://127.0.0.1:3456/list?limit=20"
```

---

## 6. 常见问题

- 保存时报 `401 unauthorized`  
  `X-API-Key` 与 `.env` 的 `WIKI_BRIDGE_API_KEY` 不一致。

- 保存时报 `404 not_found`  
  多半是旧进程占着端口。先确认当前启动的是本项目最新 `bridge/server.js`。

- 保存时报连接失败  
  先确认 `npm run server` 仍在运行，且端口与扩展设置一致。

---

## 7. 测试

```bash
npm test
```

