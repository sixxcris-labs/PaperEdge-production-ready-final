# PaperEdge — Search Prefill + Browser Extension Addendum

This addendum supplements `PAPEREDGE_BUILD_HANDOFF.md` and `PAPEREDGE_VERIFICATION_ADDENDUM.md`. It adds:

1. **Search URL templates** so clicking "Open [Book]" lands the user on a pre-searched results page
2. **A Chrome extension** that injects a verification overlay on sportsbook pages

## Non-negotiable boundaries (unchanged)

- No scraping of sportsbook DOMs for odds data
- No reading of the user's account, balance, or bet history
- No automation of bet placement
- No bypassing logins, geolocation, or CAPTCHAs
- The extension reads only: the URL of the active tab and the user-entered values in the overlay
- All sportsbook interactions remain visual, performed by the user

The extension's job is to **show the user what they need to compare** while they manually verify. Nothing more.

---

## Part 1: Search URL Templates

### Data model update

Replace the simple `url` field on `BookDeepLink` with a template system:

```prisma
model BookDeepLink {
  id             String @id @default(uuid())
  bookId         String
  book           Book   @relation(fields: [bookId], references: [id])
  sport          String  // "nba" | "nfl" | "mlb" | "nhl" | "ncaaf" | "ncaab" | "default"
  marketType     String  // "moneyline" | "spread" | "total" | "player_prop" | "default"
  urlTemplate    String  // e.g. "https://sportzino.com/search?q={query}"
  queryParam     String? // which trade field fills {query}: "player" | "team" | "event"
  fallbackUrl    String? // used when template can't be populated
  notes          String?
  createdAt      DateTime @default(now())
}
```

### Template resolver

```typescript
// /lib/deep-links.ts
import { prisma } from "./db";

interface TemplateVars {
  player?: string;
  team?: string;
  event?: string;
}

export async function resolveBookUrl(
  bookId: string,
  sport: string,
  marketType: string,
  vars: TemplateVars
): Promise<string | null> {
  // Try most specific → least specific
  const candidates = [
    { sport, marketType },
    { sport, marketType: "default" },
    { sport: "default", marketType },
    { sport: "default", marketType: "default" },
  ];

  for (const c of candidates) {
    const link = await prisma.bookDeepLink.findFirst({
      where: { bookId, sport: c.sport, marketType: c.marketType },
    });
    if (link) {
      return populateTemplate(link, vars);
    }
  }
  return null;
}

function populateTemplate(
  link: { urlTemplate: string; queryParam: string | null; fallbackUrl: string | null },
  vars: TemplateVars
): string {
  if (!link.urlTemplate.includes("{query}")) {
    return link.urlTemplate;
  }
  const value = link.queryParam ? vars[link.queryParam as keyof TemplateVars] : null;
  if (!value) {
    return link.fallbackUrl ?? link.urlTemplate.split("?")[0];
  }
  return link.urlTemplate.replace("{query}", encodeURIComponent(value));
}
```

### Seed data — best-effort starter templates

These are starting points the user can edit. Some books expose searchable URLs; others don't. Where they don't, we use a deep link to the sport's section and copy the player name to clipboard as backup.

```typescript
// Add to seed.ts
const deepLinkSeeds = [
  // Novig — exchange-style, has sport sections
  {
    book: "Novig", sport: "default", marketType: "default",
    urlTemplate: "https://novig.us/",
    queryParam: null,
    fallbackUrl: "https://novig.us/",
  },
  {
    book: "Novig", sport: "nba", marketType: "default",
    urlTemplate: "https://novig.us/sport/basketball/nba",
    queryParam: null,
    fallbackUrl: "https://novig.us/",
  },
  {
    book: "Novig", sport: "nfl", marketType: "default",
    urlTemplate: "https://novig.us/sport/football/nfl",
    queryParam: null,
    fallbackUrl: "https://novig.us/",
  },

  // Fliff — mostly app, web is limited
  {
    book: "Fliff", sport: "default", marketType: "default",
    urlTemplate: "https://www.getfliff.com/",
    queryParam: null,
    fallbackUrl: "https://www.getfliff.com/",
  },

  // Sportzino — sweepstakes
  {
    book: "Sportzino", sport: "default", marketType: "default",
    urlTemplate: "https://sportzino.com/",
    queryParam: null,
    fallbackUrl: "https://sportzino.com/",
  },
  {
    book: "Sportzino", sport: "nba", marketType: "default",
    urlTemplate: "https://sportzino.com/sports/basketball",
    queryParam: null,
    fallbackUrl: "https://sportzino.com/",
  },

  // Kalshi — has a real search
  {
    book: "Kalshi", sport: "default", marketType: "default",
    urlTemplate: "https://kalshi.com/search?q={query}",
    queryParam: "event",
    fallbackUrl: "https://kalshi.com/markets/sports",
  },
  {
    book: "Kalshi", sport: "default", marketType: "player_prop",
    urlTemplate: "https://kalshi.com/search?q={query}",
    queryParam: "player",
    fallbackUrl: "https://kalshi.com/markets/sports",
  },

  // theScore — has search
  {
    book: "theScore", sport: "default", marketType: "default",
    urlTemplate: "https://www.thescore.com/search?q={query}",
    queryParam: "event",
    fallbackUrl: "https://www.thescore.com/",
  },
];

for (const dl of deepLinkSeeds) {
  const book = await db.book.findFirst({
    where: { name: dl.book, userId: user.id },
  });
  if (book) {
    await db.bookDeepLink.create({
      data: { bookId: book.id, ...dl, book: undefined } as any,
    });
  }
}
```

### User-editable deep links page

Build `/app/books/[id]/deep-links` so the user can refine these templates as they discover better URLs.

```tsx
// Form fields per template:
// - Sport (dropdown)
// - Market type (dropdown)
// - URL template (text input, with {query} placeholder)
// - Query field (dropdown: player | team | event | none)
// - Fallback URL (text input)
// - "Test" button: opens the resolved URL in a new tab using a sample value
```

This is critical: book URLs change. The user must be able to fix them without touching code.

---

## Part 2: Chrome Extension

### Extension architecture

```
extensions/paperedge-verifier/
├── manifest.json
├── background.js         # service worker, talks to local API
├── content.js            # injected into sportsbook pages
├── overlay.html          # the floating panel UI
├── overlay.css
├── overlay.js
├── popup.html            # extension toolbar popup
├── popup.js
└── icons/
    ├── 16.png
    ├── 48.png
    └── 128.png
```

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "PaperEdge Verifier",
  "version": "0.1.0",
  "description": "Side-by-side line verification for OddsJam paper trades.",
  "permissions": ["activeTab", "storage", "clipboardWrite"],
  "host_permissions": [
    "https://novig.us/*",
    "https://*.novig.us/*",
    "https://www.getfliff.com/*",
    "https://sportzino.com/*",
    "https://*.sportzino.com/*",
    "https://kalshi.com/*",
    "https://*.kalshi.com/*",
    "https://www.thescore.com/*",
    "http://localhost:3000/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://novig.us/*",
        "https://*.novig.us/*",
        "https://www.getfliff.com/*",
        "https://sportzino.com/*",
        "https://*.sportzino.com/*",
        "https://kalshi.com/*",
        "https://*.kalshi.com/*",
        "https://www.thescore.com/*"
      ],
      "js": ["content.js"],
      "css": ["overlay.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

### background.js — talks to local PaperEdge API

```javascript
// background.js
const API_BASE = "http://localhost:3000";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_ACTIVE_TRADE") {
    // Get the trade currently being verified
    fetch(`${API_BASE}/api/trades/active-verification`)
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, trade: data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === "VERIFY_LEG") {
    fetch(`${API_BASE}/api/trades/${msg.tradeId}/verify-leg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "DETECT_BOOK") {
    sendResponse({ book: detectBookFromUrl(sender.tab?.url || "") });
    return false;
  }
});

function detectBookFromUrl(url) {
  if (url.includes("novig.us")) return "Novig";
  if (url.includes("getfliff.com")) return "Fliff";
  if (url.includes("sportzino.com")) return "Sportzino";
  if (url.includes("kalshi.com")) return "Kalshi";
  if (url.includes("thescore.com")) return "theScore";
  return null;
}
```

### content.js — injects the overlay

```javascript
// content.js
(function () {
  // Detect which book we're on
  const book = detectBook(window.location.hostname);
  if (!book) return;

  // Ask background for the active trade
  chrome.runtime.sendMessage({ type: "FETCH_ACTIVE_TRADE" }, (response) => {
    if (!response?.ok || !response.trade) {
      // No active trade — don't inject anything
      return;
    }
    injectOverlay(response.trade, book);
  });

  function detectBook(host) {
    if (host.includes("novig.us")) return "Novig";
    if (host.includes("getfliff.com")) return "Fliff";
    if (host.includes("sportzino.com")) return "Sportzino";
    if (host.includes("kalshi.com")) return "Kalshi";
    if (host.includes("thescore.com")) return "theScore";
    return null;
  }

  function injectOverlay(trade, book) {
    // Find the leg that matches this book
    const leg = trade.legs.find((l) => l.book.name === book);
    if (!leg) return;

    const root = document.createElement("div");
    root.id = "paperedge-overlay";
    root.innerHTML = `
      <div class="pe-header">
        <span class="pe-title">PaperEdge</span>
        <button class="pe-close" id="pe-close">×</button>
      </div>
      <div class="pe-body">
        <div class="pe-trade-info">
          <div class="pe-row"><span class="pe-label">Event</span><span>${escape(trade.eventName)}</span></div>
          <div class="pe-row"><span class="pe-label">Market</span><span>${escape(trade.marketType)} / ${escape(trade.gamePeriod)}</span></div>
          <div class="pe-row"><span class="pe-label">Side</span><span><strong>${escape(leg.side)}</strong></span></div>
          <div class="pe-row"><span class="pe-label">Expected odds</span><span><strong>${formatOdds(leg.oddsAmerican)}</strong></span></div>
          ${leg.lineValue !== null ? `<div class="pe-row"><span class="pe-label">Expected line</span><span><strong>${leg.lineValue}</strong></span></div>` : ""}
          <div class="pe-row"><span class="pe-label">Stake</span><span>$${leg.stake.toFixed(2)}</span></div>
        </div>

        <div class="pe-verify">
          <label class="pe-field">
            <span>Observed odds</span>
            <input type="number" id="pe-observed-odds" placeholder="${formatOdds(leg.oddsAmerican)}" />
          </label>
          ${leg.lineValue !== null ? `
          <label class="pe-field">
            <span>Observed line</span>
            <input type="number" step="0.5" id="pe-observed-line" placeholder="${leg.lineValue}" />
          </label>
          ` : ""}
          <label class="pe-field">
            <span>Notes</span>
            <input type="text" id="pe-notes" placeholder="Optional" />
          </label>

          <div class="pe-buttons">
            <button class="pe-btn pe-btn-verify" id="pe-btn-verified">✓ Verified</button>
            <button class="pe-btn pe-btn-warn" id="pe-btn-odds">Odds moved</button>
            <button class="pe-btn pe-btn-warn" id="pe-btn-line">Line moved</button>
            <button class="pe-btn pe-btn-fail" id="pe-btn-missing">Not available</button>
          </div>

          <div class="pe-status" id="pe-status"></div>
        </div>

        <div class="pe-copy">
          <button class="pe-btn pe-btn-ghost" id="pe-copy-name">Copy "${escape(leg.side)}" to clipboard</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    wireOverlay(trade, leg);
  }

  function wireOverlay(trade, leg) {
    document.getElementById("pe-close").onclick = () => {
      document.getElementById("paperedge-overlay")?.remove();
    };

    document.getElementById("pe-copy-name").onclick = async () => {
      await navigator.clipboard.writeText(leg.side);
      flashStatus("Copied. Paste into the book's search.");
    };

    const submit = (status) => {
      const observedOdds = document.getElementById("pe-observed-odds")?.value;
      const observedLine = document.getElementById("pe-observed-line")?.value;
      const notes = document.getElementById("pe-notes")?.value;

      const payload = {
        legId: leg.id,
        status,
        observedOddsAmerican: observedOdds ? parseInt(observedOdds, 10) : null,
        observedLineValue: observedLine ? parseFloat(observedLine) : null,
        notes: notes || null,
      };

      chrome.runtime.sendMessage(
        { type: "VERIFY_LEG", tradeId: trade.id, payload },
        (resp) => {
          if (resp?.ok) {
            flashStatus(`Saved as "${status.replace(/_/g, " ")}". You can close this tab.`);
          } else {
            flashStatus("Save failed — is PaperEdge running at localhost:3000?", true);
          }
        }
      );
    };

    document.getElementById("pe-btn-verified").onclick = () => submit("verified");
    document.getElementById("pe-btn-odds").onclick = () => submit("odds_moved");
    document.getElementById("pe-btn-line").onclick = () => submit("line_moved");
    document.getElementById("pe-btn-missing").onclick = () => submit("market_unavailable");
  }

  function flashStatus(msg, isError = false) {
    const el = document.getElementById("pe-status");
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? "pe-status pe-error" : "pe-status pe-success";
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function formatOdds(n) {
    return n > 0 ? `+${n}` : String(n);
  }
})();
```

### overlay.css

```css
#paperedge-overlay {
  position: fixed;
  top: 80px;
  right: 16px;
  width: 320px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #111827;
}

#paperedge-overlay * {
  box-sizing: border-box;
}

.pe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #1e40af;
  color: white;
  border-radius: 12px 12px 0 0;
}

.pe-title {
  font-weight: 600;
  letter-spacing: 0.3px;
}

.pe-close {
  background: transparent;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.pe-body {
  padding: 12px 14px;
}

.pe-trade-info {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.pe-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 12px;
}

.pe-label {
  color: #6b7280;
}

.pe-field {
  display: block;
  margin-bottom: 8px;
}

.pe-field span {
  display: block;
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 3px;
}

.pe-field input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}

.pe-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 10px;
}

.pe-btn {
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
}

.pe-btn-verify {
  background: #10b981;
  color: white;
  grid-column: span 2;
}

.pe-btn-warn {
  background: #f59e0b;
  color: white;
}

.pe-btn-fail {
  background: #ef4444;
  color: white;
  grid-column: span 2;
}

.pe-btn-ghost {
  background: #f3f4f6;
  color: #374151;
  margin-top: 8px;
  width: 100%;
}

.pe-status {
  margin-top: 10px;
  padding: 8px;
  border-radius: 6px;
  font-size: 12px;
  text-align: center;
  min-height: 18px;
}

.pe-success {
  background: #ecfdf5;
  color: #065f46;
}

.pe-error {
  background: #fef2f2;
  color: #991b1b;
}

.pe-copy {
  margin-top: 8px;
  border-top: 1px solid #e5e7eb;
  padding-top: 10px;
}
```

### popup.html — extension toolbar popup

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; width: 280px; padding: 12px; margin: 0; }
    h2 { font-size: 14px; margin: 0 0 8px 0; }
    .status { font-size: 12px; padding: 8px; border-radius: 6px; margin-bottom: 8px; }
    .ok { background: #ecfdf5; color: #065f46; }
    .warn { background: #fef3c7; color: #92400e; }
    a { color: #1e40af; font-size: 12px; }
  </style>
</head>
<body>
  <h2>PaperEdge Verifier</h2>
  <div id="status" class="status">Checking...</div>
  <a href="http://localhost:3000" target="_blank">Open PaperEdge ▸</a>
  <script src="popup.js"></script>
</body>
</html>
```

### popup.js

```javascript
chrome.runtime.sendMessage({ type: "FETCH_ACTIVE_TRADE" }, (resp) => {
  const el = document.getElementById("status");
  if (!resp?.ok) {
    el.className = "status warn";
    el.textContent = "Can't reach PaperEdge at localhost:3000. Start the app.";
    return;
  }
  if (!resp.trade) {
    el.className = "status warn";
    el.textContent = "No active trade. Start verification from PaperEdge first.";
    return;
  }
  el.className = "status ok";
  el.textContent = `Verifying: ${resp.trade.eventName}`;
});
```

---

## Part 3: Web App API additions

The extension needs an endpoint to fetch the currently-active trade.

### Concept: "active verification"

When the user clicks "Start verification" on a trade in the web app, we mark it as the active one. The extension polls this endpoint.

```prisma
// Add to UserSettings:
model UserSettings {
  // ... existing fields
  activeVerificationTradeId String?
}
```

```typescript
// /app/api/trades/active-verification/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const userId = "local-user-id"; // single-user MVP
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.activeVerificationTradeId) {
    return NextResponse.json(null);
  }

  const trade = await prisma.paperTrade.findUnique({
    where: { id: settings.activeVerificationTradeId },
    include: {
      legs: { include: { book: true } },
    },
  });

  // CORS for extension
  return NextResponse.json(trade, {
    headers: {
      "Access-Control-Allow-Origin": "chrome-extension://*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
```

### Update the verify-leg route to handle CORS

```typescript
// /app/api/trades/[id]/verify-leg/route.ts
// Add OPTIONS handler and CORS headers to the POST response
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  // ... existing logic ...
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
```

### "Start verification" button on the trade page

When the user clicks this on `/trades/[id]/verify`, the app:

1. Sets `userSettings.activeVerificationTradeId = trade.id`
2. Opens each leg's book in a new tab using the resolved search URL
3. The extension content scripts on those tabs then fetch the active trade and inject the overlay

```typescript
// /app/trades/[id]/verify/page.tsx — handler
async function startVerification() {
  // Mark this trade as active
  await fetch(`/api/trades/${trade.id}/start-verification`, { method: "POST" });

  // Open each leg's book
  for (const leg of trade.legs) {
    const url = await fetch(
      `/api/deep-link?bookId=${leg.bookId}&sport=${trade.sport}&marketType=${trade.marketType}&player=${encodeURIComponent(leg.side)}&event=${encodeURIComponent(trade.eventName)}`
    ).then(r => r.text());
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
```

---

## Part 4: Installing the extension (dev mode)

For local development:

1. Build the extension code into `extensions/paperedge-verifier/` folder
2. Open Chrome → `chrome://extensions/`
3. Toggle "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `extensions/paperedge-verifier` folder
6. Pin the extension to the toolbar

The extension only activates on the 5 sportsbook domains plus `localhost:3000`. It does nothing on any other site.

For shipping to other users later: same flow, or publish to the Chrome Web Store (requires a developer account and review).

---

## Part 5: Build order updates

After the original Phase 10, add:

- **Phase 11 — Search URL templates**
  - Replace `BookDeepLink.url` with template fields
  - Build the resolver
  - Update seed data
  - Build the user-editable deep links page per book

- **Phase 12 — Active verification API**
  - Add `activeVerificationTradeId` to `UserSettings`
  - Build `/api/trades/active-verification` with CORS
  - Build `/api/trades/[id]/start-verification`
  - Update `/trades/[id]/verify/page.tsx` with "Start verification" flow

- **Phase 13 — Chrome extension MVP**
  - Build the extension folder
  - Test locally on all 5 books
  - Document the install steps in `EXTENSION_INSTALL.md`

---

## Part 6: What the extension does NOT do

Worth restating because it'd be tempting to add these:

- ❌ Read odds from the sportsbook page (DOM scraping)
- ❌ Auto-detect when a market matches the trade
- ❌ Read account balance, bet history, or any account data
- ❌ Auto-fill bet slips
- ❌ Click buttons on the sportsbook page
- ❌ Take screenshots
- ❌ Track which pages you visit beyond the 5 whitelisted hosts
- ❌ Send any data to anywhere except `localhost:3000`

The extension is a verification HUD. The user does all reading and clicking on the sportsbook.

---

## What "done" looks like for this addendum

1. Clicking "Open Sportzino" on a player prop opens Sportzino's NBA section (or search results if Sportzino has search)
2. The Chrome extension overlay appears on Sportzino, Novig, Fliff, Kalshi, and theScore showing the trade's expected line
3. User enters observed odds in the overlay, clicks "Verified" or a failure reason
4. Result posts to localhost PaperEdge and updates the trade
5. User can close the tab and move to the next book
6. Deep link templates are editable per book per sport per market type
7. Verification funnel report (from previous addendum) populates correctly

---

## Files to create

```
paperedge/
├── (existing Next.js app)
├── prisma/
│   └── schema.prisma                 (updated)
├── app/
│   ├── api/
│   │   ├── deep-link/route.ts        (updated)
│   │   ├── trades/
│   │   │   ├── active-verification/route.ts   (new)
│   │   │   └── [id]/
│   │   │       ├── start-verification/route.ts (new)
│   │   │       └── verify-leg/route.ts        (CORS update)
│   └── books/
│       └── [id]/
│           └── deep-links/page.tsx   (new)
└── lib/
    └── deep-links.ts                  (updated)

extensions/paperedge-verifier/
├── manifest.json
├── background.js
├── content.js
├── overlay.css
├── popup.html
├── popup.js
├── icons/
│   ├── 16.png
│   ├── 48.png
│   └── 128.png
└── EXTENSION_INSTALL.md
```
