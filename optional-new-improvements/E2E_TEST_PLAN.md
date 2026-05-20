# Optional E2E Test Plan

Recommended end-to-end scenarios:

1. Seed local data, open verifier import, paste an OddsJam-style opportunity, and assert it appears in `/verify`.
2. Open `/verify/[id]`, save both legs as verified with observed odds and liquidity, complete the checklist, and lock.
3. Assert the locked opportunity appears in verifier `/locked` and the dashboard `/trades` route.
4. Settle the locked paper trade and assert bankroll/P&L metrics update.
5. Fail an opportunity for unavailable market and assert it appears in `/skipped` but not in dashboard exposure.
6. Configure a book deep link and assert the verifier opens the resolved URL.
