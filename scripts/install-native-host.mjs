#!/usr/bin/env node
/**
 * 生成并安装 macOS Chrome Native Messaging host 清单。
 * 用法：node scripts/install-native-host.mjs <extension_id>
 *
 * extension_id 在 chrome://extensions 加载已解压扩展后可看到。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const hostName = "com.chrome_plugin_wiki.bridge";
const runner = path.join(root, "bridge", "run-native-host.sh");

const extId = process.argv[2];
if (!extId || !/^[a-p]{32}$/.test(extId)) {
  process.stderr.write(
    "用法: node scripts/install-native-host.mjs <32位扩展ID>\n" +
      "说明: ID 在 chrome://extensions 加载已解压扩展后可见，字符仅为 a–p。\n" +
      "示例: node scripts/install-native-host.mjs abcdefghijklmnopabcdefghijklmnop\n",
  );
  process.exit(1);
}

if (!fs.existsSync(runner)) {
  process.stderr.write(`缺少 ${runner}\n`);
  process.exit(1);
}

fs.chmodSync(runner, 0o755);

const nodePathFile = path.join(root, "bridge", ".native-node-path");
fs.writeFileSync(nodePathFile, `${process.execPath}\n`, "utf8");

const manifest = {
  name: hostName,
  description: "Chrome Plugin Wiki — Native save bridge",
  path: runner,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extId}/`],
};

const outDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "NativeMessagingHosts",
);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${hostName}.json`);
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), "utf8");

process.stdout.write(
  `已写入: ${outFile}\n已记录 node 路径: ${nodePathFile}\n请完全退出并重启 Chrome 后再试「保存到本机」。\n`,
);
