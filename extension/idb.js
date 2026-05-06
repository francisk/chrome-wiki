const DB_NAME = "wiki_db";
const DB_VERSION = 1;
const STORE_MATERIALS = "materials";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MATERIALS)) {
        const store = db.createObjectStore(STORE_MATERIALS, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("url", "url", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_open_failed"));
  });
}

export async function ensureDb() {
  const db = await openDb();
  db.close();
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("idb_tx_aborted"));
    tx.onerror = () => reject(tx.error || new Error("idb_tx_error"));
  });
}

export async function putMaterial(rec) {
  const db = await openDb();
  try {
    const tx = db.transaction([STORE_MATERIALS], "readwrite");
    tx.objectStore(STORE_MATERIALS).put(rec);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function listMaterials({ limit = 100 } = {}) {
  const db = await openDb();
  try {
    const tx = db.transaction([STORE_MATERIALS], "readonly");
    const store = tx.objectStore(STORE_MATERIALS);
    const idx = store.index("savedAt");
    const out = [];
    await new Promise((resolve, reject) => {
      const req = idx.openCursor(null, "prev");
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        out.push(cursor.value);
        if (out.length >= limit) {
          resolve();
          return;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error("idb_cursor_failed"));
    });
    await txDone(tx);
    return out;
  } finally {
    db.close();
  }
}

function normQuery(q) {
  return String(q ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function haystack(rec) {
  return [
    rec?.title ?? "",
    rec?.url ?? "",
    rec?.brief ?? "",
    rec?.keywords ?? "",
  ]
    .join("\n")
    .toLowerCase();
}

export async function searchMaterialsLocal({ q, limit = 20 } = {}) {
  const qq = normQuery(q);
  if (!qq) {
    return [];
  }
  const items = await listMaterials({ limit: 500 });
  const out = [];
  for (const it of items) {
    const h = haystack(it).replace(/\s+/g, "");
    if (h.includes(qq)) {
      out.push(it);
      if (out.length >= limit) {
        break;
      }
    }
  }
  return out;
}

export async function updateMaterialSync(id, patch) {
  const db = await openDb();
  try {
    const tx = db.transaction([STORE_MATERIALS], "readwrite");
    const store = tx.objectStore(STORE_MATERIALS);
    const cur = await new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("idb_get_failed"));
    });
    if (cur) {
      const next = { ...cur, ...patch };
      store.put(next);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

