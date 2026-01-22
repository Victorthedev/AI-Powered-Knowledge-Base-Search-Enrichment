import { pool } from "./index.js";

export type DocumentRow = {
  id: string;
  filename: string;
  content_hash: string;
  mime_type: string;
  storage_path: string;
  text_path: string | null;
  status: "queued" | "processing" | "completed" | "failed";
};

export type JobRow = {
  id: string;
  document_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  error_message: string | null;
};

export async function findDocumentByHash(hash: string): Promise<DocumentRow | null> {
  const res = await pool.query(`SELECT * FROM documents WHERE content_hash = $1 LIMIT 1`, [hash]);
  return res.rows[0] ?? null;
}

export async function getDocument(documentId: string): Promise<DocumentRow | null> {
  const res = await pool.query(`SELECT * FROM documents WHERE id = $1 LIMIT 1`, [documentId]);
  return res.rows[0] ?? null;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const res = await pool.query(
    `SELECT * FROM documents ORDER BY created_at DESC LIMIT 200`
  );
  return res.rows as DocumentRow[];
}

export async function insertDocument(doc: Omit<DocumentRow, "status"> & { status?: DocumentRow["status"] }) {
  const status = doc.status ?? "queued";
  await pool.query(
    `INSERT INTO documents (id, filename, content_hash, mime_type, storage_path, text_path, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [doc.id, doc.filename, doc.content_hash, doc.mime_type, doc.storage_path, doc.text_path, status]
  );
}

export async function setDocumentStatus(documentId: string, status: DocumentRow["status"]) {
  await pool.query(`UPDATE documents SET status = $2 WHERE id = $1`, [documentId, status]);
}

export async function setDocumentTextPath(documentId: string, textPath: string) {
  await pool.query(`UPDATE documents SET text_path = $2 WHERE id = $1`, [documentId, textPath]);
}

export async function insertJob(job: { id: string; document_id: string }) {
  await pool.query(
    `INSERT INTO ingestion_jobs (id, document_id, status, progress, stage)
     VALUES ($1,$2,'queued',0,'UPLOADED')`,
    [job.id, job.document_id]
  );
}

export async function getJob(jobId: string): Promise<JobRow | null> {
  const res = await pool.query(`SELECT * FROM ingestion_jobs WHERE id = $1`, [jobId]);
  return res.rows[0] ?? null;
}

export async function updateJob(jobId: string, patch: Partial<JobRow>) {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;

  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
  const values = fields.map((f) => (patch as any)[f]);

  await pool.query(`UPDATE ingestion_jobs SET ${sets} WHERE id = $1`, [jobId, ...values]);
}
