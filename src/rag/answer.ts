import { OpenAI } from "openai";
import { env } from "../config/env.js";
import type { RetrievedChunk } from "./retrieve.js";
import type { ExternalSnippet } from "./autoEnrich.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
  external: ExternalSnippet[]
) {
  const docContext = chunks
    .map((c) => `DOC_CHUNK ${c.chunk_id} (doc ${c.document_id}):\n${c.text}`)
    .join("\n\n---\n\n");

  const extContext = external
    .map((s) => `EXTERNAL ${s.id} (${s.title}) ${s.url}:\n${s.text}`)
    .join("\n\n---\n\n");

  const prompt = `
You are a knowledge base assistant.

Answer using the uploaded documents first. You may use EXTERNAL snippets only to fill gaps.
If you use external info, clearly indicate it and cite it.

Return JSON exactly:
{
  "answer": string,
  "citations": [
    {
      "source_type": "doc_chunk" | "external",
      "chunk_id"?: string,
      "document_id"?: string,
      "url"?: string,
      "title"?: string,
      "excerpt": string
    }
  ]
}

Rules:
- Every major claim must have a citation.
- Excerpt max 200 chars, copied from the source text.
- If insufficient info even after external snippets, say what is missing.

QUESTION:
${question}

DOCUMENT CHUNKS:
${docContext || "(none)"}

EXTERNAL SNIPPETS:
${extContext || "(none)"}
`.trim();

  const res = await client.chat.completions.create({
    model: env.CHAT_MODEL,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }]
  });

  return res.choices[0]?.message?.content ?? "";
}
