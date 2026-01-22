import { pool } from "../db/index.js";
import { embedText } from "../ingest/embed.js";

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  text: string;
  distance: number;
};

function toPgVectorLiteral(vec: number[]) {
  return `[${vec.join(",")}]`;
}

export async function retrieveTopK(question: string, topK: number, documentIds?: string[]) {
  const [qEmb] = await embedText([question]);
  const qVec = toPgVectorLiteral(qEmb);

  const params: any[] = [qVec, topK];
  let where = `d.status = 'completed'`;

  if (documentIds?.length) {
    params.push(documentIds);
    where += ` AND c.document_id = ANY($3::uuid[])`;
  }

  const sql = `
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.text,
      (c.embedding <=> $1::vector) AS distance
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE ${where}
    ORDER BY c.embedding <=> $1::vector
    LIMIT $2
  `;

  const res = await pool.query(sql, params);
  return res.rows as RetrievedChunk[];
}
