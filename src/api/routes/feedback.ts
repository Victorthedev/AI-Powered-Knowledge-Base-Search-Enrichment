import express from "express";
import { randomUUID } from "crypto";
import { FeedbackRequestSchema } from "../../types.js";
import { pool } from "../../db/index.js";

export const feedbackRouter = express.Router();

feedbackRouter.post("/", async (req, res) => {
  try {
    const body = FeedbackRequestSchema.parse(req.body);

    const exists = await pool.query(`SELECT id FROM qa_runs WHERE id = $1`, [body.query_id]);
    if (exists.rowCount === 0) return res.status(404).json({ error: "query_id not found" });

    const id = randomUUID();
    await pool.query(
      `INSERT INTO feedback (id, qa_run_id, rating, is_helpful, comment)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, body.query_id, body.rating, body.is_helpful, body.comment ?? null]
    );

    return res.json({ feedback_id: id, ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Invalid feedback" });
  }
});
