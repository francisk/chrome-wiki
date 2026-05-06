/**
 * Chrome Native Messaging 入站帧解析（stdin）。
 * 安全/健壮性：单帧上限、完整帧后才 JSON.parse，支持一次 read() 粘包多字节（历史 bug 根因）。
 */

export const CHROME_NATIVE_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;

export class ChromeNativeInboundBuffer {
  constructor() {
    this.buf = Buffer.alloc(0);
  }

  append(chunk) {
    if (chunk && chunk.length > 0) {
      this.buf = Buffer.concat([this.buf, chunk]);
    }
  }

  /**
   * 若缓冲区已形成完整一帧则解析并消耗；否则返回 null。
   * @returns {object|null}
   * @throws {Error} invalid_message_length | invalid_json
   */
  tryConsumeMessage() {
    if (this.buf.length < 4) {
      return null;
    }
    const len = this.buf.readUInt32LE(0);
    if (len <= 0 || len > CHROME_NATIVE_MAX_PAYLOAD_BYTES) {
      throw new Error("invalid_message_length");
    }
    if (this.buf.length < 4 + len) {
      return null;
    }
    const body = this.buf.subarray(4, 4 + len);
    this.buf = this.buf.subarray(4 + len);
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      throw new Error("invalid_json");
    }
  }

  get bufferedBytes() {
    return this.buf.length;
  }
}

/** 编码一帧（供测试与对照协议） */
export function encodeChromeNativeFrame(obj) {
  const payload = Buffer.from(JSON.stringify(obj), "utf8");
  if (payload.length > CHROME_NATIVE_MAX_PAYLOAD_BYTES) {
    throw new Error("payload_too_large");
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}
