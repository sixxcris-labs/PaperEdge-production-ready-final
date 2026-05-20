import express from "express";
import "./db";
import { booksRouter } from "./routes/books";
import { summaryRouter } from "./routes/summary";
import { backupRouter } from "./routes/backup";

const app = express();
app.use(express.json({ limit: "20mb" }));

app.use("/api/books", booksRouter);
app.use("/api/summary", summaryRouter);
app.use("/api", backupRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = 5174;
const HOST = "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`[bookmap] api listening on http://${HOST}:${PORT}`);
});
