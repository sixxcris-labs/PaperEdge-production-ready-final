const DEFAULT_API_BASE = "http://localhost:3001";
const statusEl = document.getElementById("status");
const apiBaseEl = document.getElementById("apiBase");
const saveEl = document.getElementById("saveApiBase");
const openEl = document.getElementById("openVerifier");

chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE }, ({ apiBase }) => {
  apiBaseEl.value = apiBase;
  openEl.href = apiBase;
  refreshStatus();
});

saveEl.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_API_BASE", apiBase: apiBaseEl.value }, (resp) => {
    if (!resp?.ok) {
      statusEl.className = "status err";
      statusEl.textContent = resp?.error || "Invalid API base URL.";
      return;
    }
    apiBaseEl.value = resp.apiBase;
    openEl.href = resp.apiBase;
    refreshStatus();
  });
});

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "FETCH_ACTIVE_TRADE" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      statusEl.className = "status err";
      statusEl.textContent = "Extension error. Try reloading the extension.";
      return;
    }
    if (!resp.ok) {
      statusEl.className = "status warn";
      statusEl.textContent = `Cannot reach PaperEdge verifier at ${resp.apiBase || DEFAULT_API_BASE}.`;
      return;
    }
    if (!resp.trade) {
      statusEl.className = "status warn";
      statusEl.textContent = "No active opportunity. Click Start verification inside PaperEdge Verifier first.";
      return;
    }
    statusEl.className = "status ok";
    statusEl.textContent = "Verifying: " + resp.trade.eventName;
  });
}
