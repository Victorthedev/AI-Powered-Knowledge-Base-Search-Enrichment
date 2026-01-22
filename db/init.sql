CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  filename TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  text_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INT NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'UPLOADED',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  text TEXT NOT NULL,
  token_estimate INT NOT NULL DEFAULT 0,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks(document_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_ivfflat
ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated ON documents;
CREATE TRIGGER trg_documents_updated
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_jobs_updated ON ingestion_jobs;
CREATE TRIGGER trg_jobs_updated
BEFORE UPDATE ON ingestion_jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS qa_runs (
  id UUID PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence REAL NOT NULL,
  missing_info TEXT[] NOT NULL DEFAULT '{}',
  enrichment_suggestions TEXT[] NOT NULL DEFAULT '{}',
  citations JSONB NOT NULL DEFAULT '[]',
  used_external BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY,
  qa_run_id UUID NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  is_helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
