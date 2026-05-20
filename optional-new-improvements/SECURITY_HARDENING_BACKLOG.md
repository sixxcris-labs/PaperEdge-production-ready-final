# Optional Security Hardening Backlog

These items are optional for local single-user operation but recommended before hosting PaperEdge for multiple users.

1. Add real authentication and replace the local `local@paperedge.app` user helper.
2. Enforce route-level authorization middleware for every dashboard and verifier route.
3. Replace permissive local extension CORS with explicit extension IDs once the Chrome extension is packaged.
4. Add request rate limiting and structured API logging.
5. Move SQLite to a managed database or implement encrypted backups and restore drills.
6. Add dependency scanning in CI.
7. Add browser end-to-end tests for import → verify → lock → settle.
