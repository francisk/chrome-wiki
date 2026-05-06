#!/usr/bin/env node
/**
 * Chrome Native Messaging host：一次会话只处理一条消息，写回一条应答后退出。
 * 与 chrome.runtime.sendNativeMessage 生命周期一致，避免 connectNative + 宿主提前
 * exit 时 onDisconnect 抢在 onMessage 之前触发（表现为 Native host has exited）。
 */
import fs from "node:fs";

import { ChromeNativeInboundBuffer } from "./lib/chrome-native-frame.js";
import { savePayloadToStore } from "./lib/store.js";

if (process.stdin.isTTY) {
  process.stderr.write("native-host 应由 Chrome 通过 Native Messaging 启动。\n");
  process.exit(1);
}

process.stdin.resume();

const inbound = new ChromeNativeInboundBuffer();

/** Chrome 每轮 sendNativeMessage 必须收到恰好一帧；无帧退出会表现为 Native host has exited。 */
let chromeReplySent = false;

function sendChromeMessage(obj) {
  if (chromeReplySent) {
    return;
  }
  chromeReplySent = true;
  const buf = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  // 必须同步写入：process.stdout.write 可能留在缓冲区，紧接着 process.exit(0) 会丢包，
  // Chrome 读不到完整帧即报 Native host has exited。
  fs.writeSync(1, header);
  fs.writeSync(1, buf);
}

function waitStdinReadableOrEnd() {
  return new Promise((resolve) => {
    const onEnd = () => {
      process.stdin.off("readable", onReadable);
      resolve("end");
    };
    const onReadable = () => {
      process.stdin.off("end", onEnd);
      resolve("readable");
    };
    process.stdin.once("end", onEnd);
    process.stdin.once("readable", onReadable);
  });
}

async function readChromeMessage() {
  while (true) {
    let msg;
    try {
      msg = inbound.tryConsumeMessage();
    } catch (e) {
      process.stderr.write(
        `wiki-native-host frame_error: ${e instanceof Error ? e.message : String(e)}\n`,
      );
      throw e;
    }
    if (msg !== null) {
      return msg;
    }
    if (process.stdin.readableEnded) {
      throw new Error("stdin_eof");
    }
    const chunk = process.stdin.read();
    if (chunk && chunk.length > 0) {
      inbound.append(chunk);
      continue;
    }
    if (process.stdin.readableEnded) {
      throw new Error("stdin_eof");
    }
    await waitStdinReadableOrEnd();
  }
}

async function main() {
  let msg;
  try {
    msg = await readChromeMessage();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    process.stderr.write(`wiki-native-host read_failed: ${detail}\n`);
    sendChromeMessage({ ok: false, error: `read_failed:${detail}` });
    process.exit(0);
    return;
  }

  if (msg && msg.action === "save" && msg.payload) {
    try {
      const rec = savePayloadToStore(msg.payload);
      sendChromeMessage({ ok: true, id: rec.id });
    } catch (e) {
      sendChromeMessage({
        ok: false,
        error: e instanceof Error ? e.message : "save_failed",
      });
    }
  } else {
    sendChromeMessage({ ok: false, error: "unknown_action" });
  }
  process.exit(0);
}

process.on("unhandledRejection", (r) => {
  process.stderr.write(`wiki-native-host unhandledRejection: ${String(r)}\n`);
  try {
    sendChromeMessage({
      ok: false,
      error: `internal:${String(r)}`,
    });
  } catch {
    /* ignore */
  }
  process.exit(0);
});

process.on("uncaughtException", (e) => {
  process.stderr.write(
    `wiki-native-host uncaughtException: ${e instanceof Error ? e.stack || e.message : String(e)}\n`,
  );
  try {
    sendChromeMessage({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  } catch {
    /* ignore */
  }
  process.exit(0);
});

main();
