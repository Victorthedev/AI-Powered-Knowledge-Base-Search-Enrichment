import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const ingestionQueue = new Queue("ingestion", {
  connection: { url: env.REDIS_URL }
});
