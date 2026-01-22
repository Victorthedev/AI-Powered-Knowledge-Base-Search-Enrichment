import { OpenAI } from "openai";
import { env } from "../config/env.js";
import type { RetrievedChunk } from "./retrieve.js";
import { z } from "zod";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const CompletenessSchema = z.object({
  confidence: z.number().min(0).max(1),
  missing_info: z.array(z.string())
});

export async function assessCompleteness(question: string, answer: string, chunks: RetrievedChunk[]) {
  if (chunks.length === 0) {
    return { confidence: 0.05, missing_info: ["No relevant documents were retrieved for this question."] };
  }

  const ctx = chunks.map((c) => c.text.slice(0, 600)).join("\n---\n");

  const prompt = `
You are grading whether an answer is fully supported by retrieved documents.

Output JSON:
{
  "confidence": number (0 to 1),
  "missing_info": string[]
}

Be conservative: if context does not clearly support the answer, reduce confidence and list missing_info.

QUESTION:
${question}

ANSWER:
${answer}

CONTEXT SNIPPETS:
${ctx}
`.trim();

  const res = await client.chat.completions.create({
    model: env.CHAT_MODEL,
    temperature: 0.0,
    messages: [{ role: "user", content: prompt }]
  });

  const raw = res.choices[0]?.message?.content ?? "";
  try {
    const json = JSON.parse(raw);
    return CompletenessSchema.parse(json);
  } catch {
    return { confidence: 0.4, missing_info: ["Completeness grading was uncertain due to formatting issues."] };
  }
}
