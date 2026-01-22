import { z } from "zod";

export const IngestionStage = z.enum([
  "UPLOADED",
  "TEXT_EXTRACTED",
  "CHUNKED",
  "EMBEDDING_CREATED",
  "INDEXED",
  "COMPLETED"
]);

export const JobStatus = z.enum(["queued", "processing", "completed", "failed"]);
export const DocStatus = z.enum(["queued", "processing", "completed", "failed"]);

export const EnqueueJobSchema = z.object({
  jobId: z.string().uuid(),
  documentId: z.string().uuid()
});
export type EnqueueJobPayload = z.infer<typeof EnqueueJobSchema>;

export const QueryRequestSchema = z.object({
  question: z.string().min(3),
  topK: z.number().int().min(1).max(20).optional(),
  documentIds: z.array(z.string().uuid()).optional()
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const CitationSchema = z.object({
  source_type: z.enum(["doc_chunk", "external"]),
  chunk_id: z.string().uuid().optional(),
  document_id: z.string().uuid().optional(),
  url: z.string().url().optional(),
  title: z.string().optional(),
  excerpt: z.string()
});

export const QueryResponseSchema = z.object({
  query_id: z.string().uuid(),
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  missing_info: z.array(z.string()),
  enrichment_suggestions: z.array(z.string()),
  used_external: z.boolean(),
  citations: z.array(CitationSchema)
});
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

export const FeedbackRequestSchema = z.object({
  query_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  is_helpful: z.boolean(),
  comment: z.string().max(1000).optional()
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
