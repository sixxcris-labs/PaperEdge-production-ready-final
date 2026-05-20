(function () {
  "use strict";

  const book = detectBook(window.location.hostname);
  if (!book) return;
  if (document.getElementById("paperedge-overlay")) return;

  chrome.runtime.sendMessage({ type: "FETCH_ACTIVE_TRADE" }, (response) => {
    if (!response?.ok || !response.trade) return;
    injectOverlay(response.trade, book, response.apiBase);
  });

  function detectBook(hostname) {
    const host = String(hostname || "").toLowerCase();
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

  function injectOverlay(trade, book, apiBase) {
    const leg = trade.legs && trade.legs.find((l) => l.book && sameBookName(l.book.name, book));
    if (!leg) return;

    const root = document.createElement("div");
    root.id = "paperedge-overlay";
    root.innerHTML = `
      <div class="pe-header">
        <span class="pe-title">PaperEdge</span>
        <button class="pe-close" id="pe-close" aria-label="Close">×</button>
      </div>
      <div class="pe-body">
        <div class="pe-trade-info">
          <div class="pe-row"><span class="pe-label">Event</span><span>${esc(trade.eventName)}</span></div>
          <div class="pe-row"><span class="pe-label">Market</span><span>${esc(trade.marketType)} / ${esc(trade.gamePeriod)}</span></div>
          <div class="pe-row"><span class="pe-label">Side</span><span><strong>${esc(leg.side)}</strong></span></div>
          <div class="pe-row"><span class="pe-label">Expected odds</span><span><strong>${fmtOdds(leg.oddsAmerican)}</strong></span></div>
          ${leg.lineValue != null ? `<div class="pe-row"><span class="pe-label">Expected line</span><span><strong>${esc(leg.lineValue)}</strong></span></div>` : ""}
          <div class="pe-row"><span class="pe-label">Stake</span><span>$${Number(leg.stake || 0).toFixed(2)}</span></div>
        </div>

        <div class="pe-verify">
          <label class="pe-field"><span>Observed odds</span><input type="number" id="pe-observed-odds" placeholder="${fmtOdds(leg.oddsAmerican)}" /></label>
          ${leg.lineValue != null ? `<label class="pe-field"><span>Observed line</span><input type="number" step="0.5" id="pe-observed-line" placeholder="${esc(leg.lineValue)}" /></label>` : ""}
          <label class="pe-field"><span>Available liquidity / max stake</span><input type="number" step="0.01" id="pe-liquidity" placeholder="optional" /></label>
          <label class="pe-field"><span>Notes</span><input type="text" id="pe-notes" placeholder="optional" /></label>

          <div class="pe-buttons">
            <button class="pe-btn pe-btn-verify" id="pe-btn-verified">✓ Verified</button>
            <button class="pe-btn pe-btn-warn" id="pe-btn-odds">Odds moved</button>
            <button class="pe-btn pe-btn-warn" id="pe-btn-line">Line moved</button>
            <button class="pe-btn pe-btn-fail" id="pe-btn-missing">Not available</button>
          </div>
          <div class="pe-status" id="pe-status"></div>
        </div>

        <div class="pe-copy">
          <button class="pe-btn pe-btn-ghost" id="pe-copy-name">Copy "${esc(leg.side)}" to clipboard</button>
          <div class="pe-small">API: ${esc(apiBase || "http://localhost:3001")}</div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    wireOverlay(trade, leg, apiBase);
  }

  function wireOverlay(trade, leg, apiBase) {
    document.getElementById("pe-close").onclick = () => document.getElementById("paperedge-overlay")?.remove();
    document.getElementById("pe-copy-name").onclick = async () => {
      try {
        await navigator.clipboard.writeText(leg.side || "");
        flashStatus("Copied to clipboard. Paste into book search.");
      } catch {
        flashStatus("Clipboard access denied. Copy manually: " + (leg.side || ""));
      }
    };

    const submit = (status) => {
      const oddsEl = document.getElementById("pe-observed-odds");
      const lineEl = document.getElementById("pe-observed-line");
      const liquidityEl = document.getElementById("pe-liquidity");
      const notesEl = document.getElementById("pe-notes");
      const payload = {
        leg: leg.legLabel || leg.id,
        status,
        observedOdds: oddsEl?.value ? parseInt(oddsEl.value, 10) : null,
        observedLine: lineEl?.value ? parseFloat(lineEl.value) : null,
        observedLiquidity: liquidityEl?.value ? parseFloat(liquidityEl.value) : null,
        notes: notesEl?.value || null,
      };
      chrome.runtime.sendMessage({ type: "VERIFY_LEG", tradeId: trade.id, payload }, (resp) => {
        if (resp?.ok) flashStatus(`Saved as ${status.replace(/_/g, " ")}. Return to PaperEdge to finish the checklist.`);
        else flashStatus(`Save failed. Is the verifier running at ${apiBase || "localhost:3001"}?`, true);
      });
    };

    document.getElementById("pe-btn-verified").onclick = () => submit("verified");
    document.getElementById("pe-btn-odds").onclick = () => submit("odds_moved");
    document.getElementById("pe-btn-line").onclick = () => submit("line_moved");
    document.getElementById("pe-btn-missing").onclick = () => submit("market_unavailable");
  }

  function sameBookName(a, b) {
    return String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "") === String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function flashStatus(msg, isError = false) {
    const el = document.getElementById("pe-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "pe-status " + (isError ? "pe-error" : "pe-success");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function fmtOdds(n) {
    return Number(n) > 0 ? `+${n}` : String(n ?? "");
  }
})();
