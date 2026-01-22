import express from "express";
import { getJob } from "../../db/repo.js";

export const ingestionRouter = express.Router();

ingestionRouter.get("/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const job = await getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  return res.json({
    jobId: job.id,
    documentId: job.document_id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error_message
  });
});
