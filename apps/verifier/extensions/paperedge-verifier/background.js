const DEFAULT_API_BASE = "http://localhost:3001";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SET_API_BASE") {
    const apiBase = normalizeApiBase(msg.apiBase);
    if (!apiBase) {
      sendResponse({ ok: false, error: "Invalid API base URL" });
      return false;
    }
    chrome.storage.sync.set({ apiBase }, () => sendResponse({ ok: true, apiBase }));
    return true;
  }

  if (msg.type === "FETCH_ACTIVE_TRADE") {
    withApiBase((apiBase) => {
      fetch(`${apiBase}/api/trades/active-verification`)
        .then((r) => r.json())
        .then((data) => sendResponse({ ok: true, trade: data.trade ?? null, apiBase }))
        .catch((err) => sendResponse({ ok: false, error: err.message, apiBase }));
    });
    return true;
  }

  if (msg.type === "VERIFY_LEG") {
    withApiBase((apiBase) => {
      fetch(`${apiBase}/api/trades/${encodeURIComponent(msg.tradeId)}/verify-leg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.payload),
      })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => sendResponse({ ok, data, apiBase }))
        .catch((err) => sendResponse({ ok: false, error: err.message, apiBase }));
    });
    return true;
  }

  if (msg.type === "DETECT_BOOK") {
    sendResponse({ book: detectBookFromUrl(sender.tab?.url || "") });
    return false;
  }
});

function withApiBase(callback) {
  chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE }, ({ apiBase }) => {
    callback(normalizeApiBase(apiBase) || DEFAULT_API_BASE);
  });
}

function normalizeApiBase(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function detectBookFromUrl(url) {
  const host = safeHost(url);
  if (!host) return null;
  if (host.includes("4cx.io")) return "4CX";
  if (host.includes("bovada.lv")) return "Bovada";
  if (host.includes("crypto.com")) return "Crypto.com";
  if (host.includes("draftkings.com")) return "DraftKings Predictions";
  if (host.includes("fanaticsmarkets.com")) return "Fanatics Markets";
  if (host.includes("fliff.com") || host.includes("getfliff.com")) return "Fliff";
  if (host.includes("kalshi.com")) return "Kalshi";
  if (host.includes("novi.bet")) return "Novi";
  if (host.includes("novig.us")) return "Novig";
  if (host.includes("onyxodds.com")) return "Onyx Odds";
  if (host.includes("polymarket.com")) return "Polymarket";
  if (host.includes("prophetx.co")) return "Prophet X";
  if (host.includes("sportzino.com")) return "Sportzino";
  if (host.includes("betopenly.com")) return "BetOpenly";
  if (host.includes("betr.app")) return "Betr";
  if (host.includes("courtside.co")) return "Courtside";
  if (host.includes("dogghouse.com")) return "Dogg House";
  return null;
}

function safeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
