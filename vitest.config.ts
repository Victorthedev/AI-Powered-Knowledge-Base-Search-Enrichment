import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      OPENAI_API_KEY: "test-key",
      TRUSTED_DOMAINS: "en.wikipedia.org",
      AUTO_ENRICH_MAX_SNIPPETS: "3",
      CHAT_MODEL: "gpt-4",
      EMBEDDING_MODEL: "text-embedding-3-small",
      STORAGE_PATH: "./test-storage",
      OCR_PDF_DPI: "300",
      OCR_PDF_MAX_PAGES: "10",
      OCR_MIN_TEXT_CHARS_BEFORE_OCR: "100",
      SCANNED_PDF_OCR_ENABLED: "true"
    }
  }
});