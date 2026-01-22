import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  STORAGE_DIR: z.string().default("/app/storage"),
  OPENAI_API_KEY: z.string().min(1),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  CHAT_MODEL: z.string().default("gpt-4o-mini"),
  TRUSTED_DOMAINS: z.string().default("en.wikipedia.org"),
  AUTO_ENRICH_MAX_SNIPPETS: z.coerce.number().default(3),

  SCANNED_PDF_OCR_ENABLED: z.coerce.boolean().default(true),
  OCR_PDF_DPI: z.coerce.number().default(200),
  OCR_PDF_MAX_PAGES: z.coerce.number().default(15),
  OCR_MIN_TEXT_CHARS_BEFORE_OCR: z.coerce.number().default(400)
});

export const env = EnvSchema.parse(process.env);
