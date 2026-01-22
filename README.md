# AI-Powered Knowledge Base Search & Enrichment (Async RAG + OCR)

This project is a working prototype of an AI-powered knowledge base where users can upload documents, query them in natural language, receive grounded answers with citations, and get a completeness signal (confidence + missing info) with enrichment suggestions. It also supports auto-enrichment from a trusted external source and collecting user feedback for continuous improvement.

## What this solves

- **Document upload & storage** (PDF, DOCX, TXT, images)
- **Async ingestion** (extract → chunk → embed → index)
- **Search + answer** using Retrieval-Augmented Generation (RAG)
- **Completeness check** (detects missing/uncertain info)
- **Enrichment suggestions** (what to upload or add next)
- **Auto-enrichment (stretch)** from a trusted external source (allowlisted domains)
- **Answer rating (stretch)** via a feedback endpoint

---

## Note
create a postman collection with `wand-kb-rag.collection.json` and `wand-local.environment.json`

## High-level architecture

**Services**
- **API (Node/TS + Express):** upload, query, job status, feedback
- **Worker (Node/TS):** async ingestion pipeline (BullMQ)
- **Postgres + pgvector:** stores documents, chunks, embeddings, QA runs, feedback
- **Redis:** BullMQ queue backend
- **Local storage volume:** stores uploaded files + extracted text

**Data flow**
1. `POST /documents` uploads a file and creates an ingestion job.
2. Worker consumes job from Redis queue:
   - Extract text:
     - PDF (text-based): `pdf-parse`
     - DOCX: `mammoth`
     - Images: OCR via `tesseract`
     - Scanned PDFs: render pages with `pdftoppm` then OCR via `tesseract`
   - Chunk text with overlap
   - Generate embeddings
   - Store chunks + embeddings in Postgres (pgvector)
3. `POST /query`:
   - Embed the question
   - Retrieve topK nearest chunks from pgvector
   - Generate JSON answer with citations
   - Grade completeness: return `confidence` + `missing_info`
   - Suggest enrichment steps
   - If missing/low confidence: auto-enrich via allowlisted external source and re-answer
4. `POST /feedback` records rating/quality for the produced answer.

---

## Design decisions

### 1) Async ingestion (BullMQ + Redis)
Ingestion can be slow (OCR, embeddings). Making it asynchronous keeps the API responsive and supports progress visibility via `GET /ingestion/:jobId`.

### 2) Postgres + pgvector (instead of a dedicated vector DB)
Due to time constraints, I used pgvector because:
- Simple deployment (single DB)
- Real vector similarity search
- Less operational overhead than introducing a separate vector database

### 3) OCR is fully local and free
To support images and scanned PDFs without paid services:
- **tesseract-ocr** for OCR
- **poppler-utils** (`pdftoppm`) to render scanned PDF pages to images before OCR

OCR is bounded for predictable runtime (see trade-offs).

### 4) Structured output contract to reduce hallucination
Answer generation is constrained to return JSON with:
- `answer`
- `citations` (doc_chunk or external)
This enforces grounding and makes responses machine-consumable and testable.

### 5) Completeness grading and enrichment suggestions
A second model call grades whether the answer is adequately supported:
- `confidence: 0..1`
- `missing_info: string[]`
From `missing_info`, the system produces **enrichment suggestions** (what to upload / what data is missing).

### 6) Auto-enrichment with domain allowlist
When missing info exists (or confidence is low), the system can fetch additional context from a **trusted source allowlist** (default: Wikipedia REST summary). This is intentionally simple but demonstrates how external enrichment can be integrated safely.

### 7) Feedback loop endpoint
`POST /feedback` stores per-answer ratings. This enables future improvements like:
- retrieval tuning per content type
- prompt iteration backed by feedback
- building evaluation datasets

---

## Trade-offs due to the 24-hour constraint

- **No authentication / multi-user tenancy.** Single-tenant local prototype.
- **No UI.** Postman is the intended test client for speed and clarity.
- **OCR limits are bounded** for predictable ingestion time:
  - Max pages for scanned PDF OCR is capped (default 15 pages)
  - DPI is capped (default 200)
- **Auto-enrichment uses one connector** (Wikipedia summary) rather than enterprise sources (Confluence, Google Drive, Notion, SharePoint).
- **No advanced retrieval stack** (reranking, hybrid search BM25+vector, metadata filters beyond `documentIds`).
- **No evaluation harness** (offline evals, golden sets). Feedback table is the starting point.
- **No streaming token output**; API returns final JSON responses.
- **Chunking is simple** (character-based with overlap) to avoid complex tokenizers in a short timeframe.
- **polling vs WebSocket/SSE for progress visibility.** A WebSocket/SSE channel would give real-time updates and fewer repeated requests, but adds more moving parts, I used polling because it’s simplest and works well with Postman.
- **Images are indexed via OCR only (text-in-image).** This system treats images as documents by extracting text with OCR and embedding that text. As a result, pure images without readable text (e.g., logos, photos, unlabeled diagrams) do not produce useful embeddings and are not meaningfully searchable in this prototype. This was chosen to keep the ingestion pipeline free, local and implementable within the time constraints.

---

## How to run (local)

### Prerequisites
- Docker Desktop (running)
- An OpenAI API key (only for embeddings + chat)

### Setup
**Create `.env`:**
```bash
touch .env
```
**To start:**
docker compose up --build

**Services:**
- API: http://localhost:3000
- Postgres: localhost:5432
- Redis: localhost:6379

**To stop:**
docker compose down

**To wipe data (DB + uploads):**
docker compose down -v

**1) Health Check**
GET /health
Expected Response:
```json
{ "ok": true }
```
**2) Upload Document (PDF/DOCX/TXT/Image)**
POST /documents (form-data: file)
Expected Response:
```json
{
  "documentId": "uuid",
  "jobId": "uuid",
  "status": "queued",
  "deduped": false
}
```

**3) Poll Ingestion Status**
GET /ingestion/:jobId
Expected Fields:
```json
{
  "jobId": "uuid",
  "documentId": "uuid",
  "status": "processing|completed|failed",
  "progress": 0,
  "stage": "UPLOADED|TEXT_EXTRACTED|CHUNKED|EMBEDDING_CREATED|INDEXED|COMPLETED",
  "error": null
}
```
**4) Query Across All Documents**
POST /query
{
  "question": "What does the document say about refunds?"
}
```json
{
  "query_id": "uuid",
  "answer": "...",
  "confidence": 0.0,
  "missing_info": [],
  "enrichment_suggestions": [],
  "used_external": false,
  "citations": [
    {
      "source_type": "doc_chunk",
      "chunk_id": "uuid",
      "document_id": "uuid",
      "excerpt": "..."
    }
  ]
}
```
**5) Query a Specific Document**
POST /query
{
  "question": "Summarize this document.",
  "documentIds": ["<documentId>"]
}

**6) Submit Feedback (Rating)**
POST /feedback
{
  "query_id": "<query_id>",
  "rating": 4,
  "is_helpful": true,
  "comment": "Good answer but needs more detail."
}
Expected response:
```json
{ "feedback_id": "uuid", "ok": true }
```

**7) Unit tests**
Run `npm test`

## Notes on PDFs, DOCX, and Images
- Text PDFs and DOCX are extracted directly
- Images are OCR'd using tesseract
- Scanned PDFs are handled by:
  - Rendering pages to PNG via pdftoppm
  - OCR'ing each page via tesseract
- If OCR is slow, reduce:
  - `OCR_PDF_MAX_PAGES`
  - `OCR_PDF_DPI`
- Images are supported when they contain readable text (screenshots, scanned pages, photos of documents). Pure images without text will not yield useful OCR output, so retrieval quality is not guaranteed for those cases.

### Core Requirements
- Document upload & storage
- Natural language search
- AI answers using documents
- Completeness detection (confidence, missing_info)
- Enrichment suggestions

### High Marks Criteria
- Structured output(JSON) 
- Handles irrelevant documents gracefully (low confidence + missing info when retrieval fails)
- Visibility/progress (job progress endpoint)
- Auto-enrichment (trusted allowlist + re-answer)
- User ratings (/feedback)

## Future Improvements (If More Time)
- Hybrid retrieval (BM25 + vectors) + reranking
- Metadata filters (file type, date, author, tags) and better per-document selection
- Caching embeddings and answers
- Better chunking using token-aware splitters
- Enterprise connectors for enrichment (Drive/Confluence/Notion) with allowlists + auditing
- Evaluation harness using stored QA runs + feedback to measure quality changes over time

In a real customer-support deployment for instance, users would not upload documents at query time. Instead, the platform would continuously ingest the company’s knowledge sources (pricing pages, billing FAQs, policy docs, internal runbooks and past resolved tickets) via connectors and scheduled syncs, embedding and indexing them ahead of time. When a customer asks a question like “I don’t understand your fee structure,” the backend would first route it to the billing/pricing domain, retrieve the most relevant passages using metadata filters (for example region and plan), and if key details are missing it would ask one or two clarifying questions before answering. If confidence remains low, it would escalate to a human agent by creating a ticket that includes the retrieved evidence and the missing information needed to resolve the case.