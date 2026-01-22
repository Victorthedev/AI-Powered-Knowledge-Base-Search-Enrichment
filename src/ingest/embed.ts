import { OpenAI } from "openai";
import { env } from "../config/env.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function embedText(texts: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: env.EMBEDDING_MODEL,
    input: texts
  });
  return res.data.map((d) => d.embedding as number[]);
}
