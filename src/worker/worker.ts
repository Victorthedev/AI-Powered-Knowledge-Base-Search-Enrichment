import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { processIngestionJob } from "./processor.js";
import { EnqueueJobSchema } from "../types.js";

const worker = new Worker(
  "ingestion",
  async (job) => {
    const payload = EnqueueJobSchema.parse(job.data);
    await processIngestionJob(payload);
  },
  { connection: { url: env.REDIS_URL }, concurrency: 2 }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
