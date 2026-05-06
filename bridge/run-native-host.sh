#!/usr/bin/env bash
# Chrome 拉起 Native Host 时环境极精简，常无 $HOME；勿用 set -u，否则未定义变量会直接退出。
# 安装脚本会写入同目录下的 .native-node-path（当前 node 绝对路径）。
set -eo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

_base="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
if [[ -n "${HOME:-}" ]]; then
  _base="$_base:$HOME/.local/bin"
fi
export PATH="$_base:${PATH:-}"

NODE_BIN="node"
if [[ -f "$DIR/.native-node-path" ]]; then
  NODE_BIN="$(tr -d '\n\r' < "$DIR/.native-node-path")"
fi

exec "$NODE_BIN" "$ROOT/bridge/native-host.js"
