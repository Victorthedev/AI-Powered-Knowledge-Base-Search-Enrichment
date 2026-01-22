import express from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { sha256, saveUpload } from "../../storage/files.js";
import { findDocumentByHash, insertDocument, insertJob, listDocuments, getDocument } from "../../db/repo.js";
import { ingestionQueue } from "../../queue/index.js";
import { EnqueueJobSchema } from "../../types.js";

export const documentsRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

documentsRouter.get("/", async (_req, res) => {
  const docs = await listDocuments();
  return res.json(
    docs.map(d => ({
      id: d.id,
      filename: d.filename,
      mime_type: d.mime_type,
      status: d.status,
      created_at: (d as any).created_at ?? undefined
    }))
  );
});

documentsRouter.get("/:documentId", async (req, res) => {
  const { documentId } = req.params;
  const doc = await getDocument(documentId);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  return res.json({
    id: doc.id,
    filename: doc.filename,
    mime_type: doc.mime_type,
    status: doc.status,
    storage_path: doc.storage_path,
    text_path: doc.text_path
  });
});

documentsRouter.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const hash = sha256(file.buffer);
    const existing = await findDocumentByHash(hash);

    if (existing && existing.status === "completed") {
      return res.json({ documentId: existing.id, jobId: null, status: "completed", deduped: true });
    }

    const documentId = existing?.id ?? randomUUID();
    const jobId = randomUUID();

    const storagePath = existing?.storage_path ?? await saveUpload(documentId, file.originalname, file.buffer);

    if (!existing) {
      await insertDocument({
        id: documentId,
        filename: file.originalname,
        content_hash: hash,
        mime_type: file.mimetype || "application/octet-stream",
        storage_path: storagePath,
        text_path: null,
        status: "queued"
      });
    }

    await insertJob({ id: jobId, document_id: documentId });

    const payload = EnqueueJobSchema.parse({ jobId, documentId });
    await ingestionQueue.add("ingest", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: true,
      removeOnFail: false
    });

    return res.json({ documentId, jobId, status: "queued", deduped: false });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Upload failed" });
  }
});
