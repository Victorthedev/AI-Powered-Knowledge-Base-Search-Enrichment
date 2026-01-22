import express from "express";
import { env } from "../config/env.js";
import { documentsRouter } from "./routes/documents.js";
import { ingestionRouter } from "./routes/ingestion.js";
import { queryRouter } from "./routes/query.js";
import { feedbackRouter } from "./routes/feedback.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/documents", documentsRouter);
app.use("/ingestion", ingestionRouter);
app.use("/query", queryRouter);
app.use("/feedback", feedbackRouter);

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
});
