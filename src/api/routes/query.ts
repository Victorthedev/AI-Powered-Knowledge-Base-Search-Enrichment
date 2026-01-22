import express from "express";
import { randomUUID } from "crypto";
import { QueryRequestSchema, QueryResponseSchema } from "../../types.js";
import { retrieveTopK } from "../../rag/retrieve.js";
import { generateAnswer } from "../../rag/answer.js";
import { assessCompleteness } from "../../rag/completeness.js";
import { suggestEnrichment } from "../../rag/enrich.js";
import { autoEnrich } from "../../rag/autoEnrich.js";
import { pool } from "../../db/index.js";

export const queryRouter = express.Router();

async function runQuery(req: express.Request, res: express.Response) {
  try {
    const parsed = QueryRequestSchema.parse(req.body);
    const topK = parsed.topK ?? 6;

    const chunks = await retrieveTopK(parsed.question, topK, parsed.documentIds);

    if (chunks.length === 0) {
      const topic = extractTopicFromQuestion(parsed.question);
      const external = await autoEnrich([topic]);
      
      if (external.length === 0) {
        const queryId = randomUUID();
        const out = QueryResponseSchema.parse({
          query_id: queryId,
          answer: "I cannot answer this question because no relevant information was found in the uploaded documents, and no external sources could provide the missing information.",
          confidence: 0.05,
          missing_info: ["No relevant documents or passages were found for this question."],
          enrichment_suggestions: ["Upload documents that directly cover this topic, then try again."],
          used_external: false,
          citations: []
        });

        await pool.query(
          `INSERT INTO qa_runs (id, question, answer, confidence, missing_info, enrichment_suggestions, citations, used_external)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
          [
            queryId,
            parsed.question,
            out.answer,
            out.confidence,
            out.missing_info,
            out.enrichment_suggestions,
            JSON.stringify(out.citations),
            out.used_external
          ]
        );

        return res.json(out);
      }

      const raw = await generateAnswer(parsed.question, [], external);
      let finalAnswer = raw;
      let finalCitations: any[] = [];
      
      try {
        const j = JSON.parse(raw);
        finalAnswer = String(j.answer ?? raw);
        finalCitations = Array.isArray(j.citations) ? j.citations : [];
      } catch {
        finalAnswer = raw;
        finalCitations = [];
      }

      const grade = await assessCompleteness(parsed.question, finalAnswer, []);
      const enrichment = suggestEnrichment(grade.missing_info ?? []);

      const queryId = randomUUID();

      const citations = processCitations(finalCitations);

      const out = QueryResponseSchema.parse({
        query_id: queryId,
        answer: finalAnswer,
        confidence: Math.min(grade.confidence, 0.6),
        missing_info: [
          "No uploaded documents contained relevant information.",
          ...(grade.missing_info ?? [])
        ],
        enrichment_suggestions: enrichment,
        used_external: true,
        citations
      });

      await pool.query(
        `INSERT INTO qa_runs (id, question, answer, confidence, missing_info, enrichment_suggestions, citations, used_external)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [
          queryId,
          parsed.question,
          out.answer,
          out.confidence,
          out.missing_info,
          out.enrichment_suggestions,
          JSON.stringify(out.citations),
          out.used_external
        ]
      );

      return res.json(out);
    }

    const raw1 = await generateAnswer(parsed.question, chunks, []);
    let answer1 = raw1;
    let citations1: any[] = [];
    try {
      const j = JSON.parse(raw1);
      answer1 = String(j.answer ?? raw1);
      citations1 = Array.isArray(j.citations) ? j.citations : [];
    } catch {}

    const grade1 = await assessCompleteness(parsed.question, answer1, chunks);
    const missing = grade1.missing_info ?? [];
    const enrichment = suggestEnrichment(missing);

    const shouldEnrich = missing.length > 0 || grade1.confidence < 0.55;

    let usedExternal = false;
    let finalAnswer = answer1;
    let finalCitations = citations1;
    let finalGrade = grade1;

    if (shouldEnrich) {
      const topics = extractTopicsFromMissingInfo(missing, parsed.question);
      const external = await autoEnrich(topics);
      if (external.length > 0) {
        usedExternal = true;
        const raw2 = await generateAnswer(parsed.question, chunks, external);

        try {
          const j2 = JSON.parse(raw2);
          finalAnswer = String(j2.answer ?? raw2);
          finalCitations = Array.isArray(j2.citations) ? j2.citations : [];
        } catch {
          finalAnswer = raw2;
          finalCitations = [];
        }

        finalGrade = await assessCompleteness(parsed.question, finalAnswer, chunks);
      }
    }

    const queryId = randomUUID();

    const citations = processCitations(finalCitations);

    await pool.query(
      `INSERT INTO qa_runs (id, question, answer, confidence, missing_info, enrichment_suggestions, citations, used_external)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        queryId,
        parsed.question,
        finalAnswer,
        finalGrade.confidence,
        finalGrade.missing_info,
        enrichment,
        JSON.stringify(citations),
        usedExternal
      ]
    );

    const out = QueryResponseSchema.parse({
      query_id: queryId,
      answer: finalAnswer,
      confidence: finalGrade.confidence,
      missing_info: finalGrade.missing_info,
      enrichment_suggestions: enrichment,
      used_external: usedExternal,
      citations
    });

    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Invalid request" });
  }
}

function extractTopicFromQuestion(question: string): string {
  let topic = question
    .toLowerCase()
    .replace(/^(what|who|where|when|why|how|is|are|was|were|do|does|did|can|could|would|should)\s+/gi, '')
    .replace(/\?/g, '')
    .trim();
  
  if (topic.startsWith('is ')) {
    topic = topic.substring(3).trim();
  }
  
  return topic || question;
}

function extractTopicsFromMissingInfo(missingInfo: string[], fallbackQuestion: string): string[] {
  if (!missingInfo.length) return [extractTopicFromQuestion(fallbackQuestion)];
  
  const topics = missingInfo.map(m => {
    const cleaned = m
      .toLowerCase()
      .replace(/^(definition|explanation|details|clarification|information|data)\s+(of|on|about|for)\s+/gi, '')
      .replace(/^(the\s+)?/gi, '')
      .trim();
    
    return cleaned || m;
  });
  
  return [...new Set(topics)].slice(0, 3);
}

function processCitations(finalCitations: any[]) {
  const UUID_RE =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

  function pickUuid(v: any): string | undefined {
    if (typeof v !== "string") return undefined;
    const m = v.match(UUID_RE);
    return m ? m[0] : undefined;
  }

  return (finalCitations ?? [])
    .map((c: any) => {
      const sourceType = c?.source_type;
      if (sourceType !== "doc_chunk" && sourceType !== "external") return null;

      const out: any = {
        source_type: sourceType,
        excerpt: String(c?.excerpt ?? "").slice(0, 220)
      };

      const chunkId = pickUuid(c?.chunk_id);
      const docId = pickUuid(c?.document_id);

      if (chunkId) out.chunk_id = chunkId;
      if (docId) out.document_id = docId;

      if (typeof c?.url === "string" && c.url) out.url = c.url;
      if (typeof c?.title === "string" && c.title) out.title = c.title;

      return out;
    })
    .filter((c: any) => c && c.source_type && c.excerpt);
}

queryRouter.post("/", runQuery);

queryRouter.post("/documents/:documentId", async (req, res) => {
  req.body = { ...(req.body ?? {}), documentIds: [req.params.documentId] };
  return runQuery(req, res);
});