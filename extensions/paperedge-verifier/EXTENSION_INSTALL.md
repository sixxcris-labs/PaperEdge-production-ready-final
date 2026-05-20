# PaperEdge Verifier Chrome Extension

## What it does

The extension is a manual verification overlay for PaperEdge verifier tabs. It shows the active TradeOpportunity leg for the current book, lets you type observed odds, line, liquidity, and notes, and posts that manual observation back to the local verifier app.

It does **not** scrape odds automatically, log into books, read account balances, bypass geolocation/KYC, click sportsbook buttons, or place bets.

## Install locally

1. Start the verifier app: `npm --workspace @paperedge/verifier run dev`.
2. Open Chrome at `chrome://extensions/`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select `paperedge/apps/verifier/extensions/paperedge-verifier/`.
6. Pin the PaperEdge icon.
7. Open the popup and confirm the API base is `http://localhost:3001`.

## Supported host patterns

The manifest includes the active/manual-verification book families used by PaperEdge: 4CX, Bovada, Crypto.com, DraftKings Predictions, Fanatics Markets, Fliff, Kalshi, Novi, Novig, Onyx Odds, Polymarket, Prophet X, Sportzino, BetOpenly, Betr, Courtside, and Dogg House.

Some book URLs may change. When a book changes domains, update `manifest.json`, `background.js`, and `content.js` together.

## Usage

1. Import an opportunity in the verifier app.
2. Open `/verify/[id]` and click **Start verification**.
3. Use the book deep-link buttons to open the book pages.
4. Search manually, enter observed values in the overlay, and save.
5. Return to PaperEdge Verifier and finish the checklist before locking.

## Troubleshooting

| Problem | Fix |
|---|---|
| Cannot reach verifier | Make sure `npm --workspace @paperedge/verifier run dev` is running on port 3001. |
| Overlay does not appear | Confirm the current host is in `manifest.json`, then reload the extension and page. |
| Save fails | Check the popup API base and the verifier terminal logs. |
| Active opportunity is blank | Click **Start verification** on the opportunity in the verifier app. |
