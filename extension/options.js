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

async function load() {
  const st = wikiGetStorage();
  const msgEl = document.getElementById("msg");
  if (!st) {
    msgEl.textContent =
      "当前扩展没有「storage」能力：请在 chrome://extensions 里删掉这个扩展，再用「加载已解压的扩展」重新选 extension 文件夹。";
    msgEl.style.color = "#c62828";
    return;
  }
  const { bridgeBase = "", bridgeApiKey = "" } = await st.get([
    "bridgeBase",
    "bridgeApiKey",
  ]);
  document.getElementById("base").value = bridgeBase || "";
  document.getElementById("key").value = bridgeApiKey || "";
}

document.getElementById("save").addEventListener("click", async () => {
  const st = wikiGetStorage();
  const msgEl = document.getElementById("msg");
  if (!st) {
    msgEl.textContent = "存储不可用：请按上面红字步骤重装扩展。";
    msgEl.style.color = "#c62828";
    return;
  }
  const base = document.getElementById("base").value.trim();
  const key = document.getElementById("key").value.trim();
  if (!base || !key) {
    msgEl.textContent = "bridge 地址和 X-API-Key 都必须填写。";
    msgEl.style.color = "#c62828";
    return;
  }
  await st.set({ bridgeBase: base, bridgeApiKey: key });
  msgEl.textContent = "已保存。";
  msgEl.style.color = "#0a0";
});

load();
