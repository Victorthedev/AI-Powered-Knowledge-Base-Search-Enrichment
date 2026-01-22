import { randomUUID } from "crypto";
import { pool } from "../db/index.js";
import { updateJob, setDocumentStatus, getJob, getDocument, setDocumentTextPath } from "../db/repo.js";
import type { EnqueueJobPayload } from "../types.js";
import { extractText } from "../ingest/extract.js";
import { saveExtractedText } from "../storage/files.js";
import { chunkText } from "../ingest/chunker.js";
import { embedText } from "../ingest/embed.js";

function toPgVectorLiteral(vec: number[]) {
  return `[${vec.join(",")}]`;
}

async function insertChunks(
  documentId: string,
  chunks: { index: number; text: string; tokenEstimate: number }[],
  embeddings: number[][]
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM chunks WHERE document_id = $1`, [documentId]);

    for (let i = 0; i < chunks.length; i++) {
      const id = randomUUID();
      const ch = chunks[i];
      const emb = embeddings[i];
      await client.query(
        `INSERT INTO chunks (id, document_id, chunk_index, text, token_estimate, embedding)
         VALUES ($1,$2,$3,$4,$5,$6::vector)`,
        [id, documentId, ch.index, ch.text, ch.tokenEstimate, toPgVectorLiteral(emb)]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function processIngestionJob(payload: EnqueueJobPayload) {
  const job = await getJob(payload.jobId);
  if (!job) return;

  try {
    await updateJob(payload.jobId, { status: "processing", progress: 5, stage: "UPLOADED", error_message: null });
    await setDocumentStatus(payload.documentId, "processing");

    const doc = await getDocument(payload.documentId);
    if (!doc) throw new Error("Document not found");

    const text = await extractText(doc.mime_type, doc.storage_path);
    await updateJob(payload.jobId, { progress: 20, stage: "TEXT_EXTRACTED" });

    const textPath = await saveExtractedText(payload.documentId, text);
    await setDocumentTextPath(payload.documentId, textPath);

    const chunks = chunkText(text, 1200, 200);
    await updateJob(payload.jobId, { progress: 40, stage: "CHUNKED" });

    const texts = chunks.map((c) => c.text);
    const embeddings = await embedText(texts);
    await updateJob(payload.jobId, { progress: 70, stage: "EMBEDDING_CREATED" });

    await insertChunks(payload.documentId, chunks, embeddings);
    await updateJob(payload.jobId, { progress: 90, stage: "INDEXED" });

    await pool.query(`ANALYZE chunks`);

    await updateJob(payload.jobId, { status: "completed", progress: 100, stage: "COMPLETED" });
    await setDocumentStatus(payload.documentId, "completed");
  } catch (e: any) {
    await updateJob(payload.jobId, {
      status: "failed",
      error_message: e?.message ?? "Ingestion failed",
      progress: Math.max(job.progress, 1)
    });
    await setDocumentStatus(payload.documentId, "failed");
    throw e;
  }
}
