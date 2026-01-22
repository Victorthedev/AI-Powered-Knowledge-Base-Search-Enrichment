import { describe, it, expect, vi, beforeEach } from "vitest";
import { chunkText } from "../src/ingest/chunker.js";
import { suggestEnrichment } from "../src/rag/enrich.js";
import { isTrusted } from "../src/rag/autoEnrich.js";
import { extractTopicFromQuestion, extractTopicsFromMissingInfo, processCitations } from "../src/api/routes/query.js";

describe("chunker", () => {
  describe("chunkText", () => {
    it("should split text into chunks with default parameters", () => {
      const text = "a".repeat(3000);
      const chunks = chunkText(text);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].index).toBe(0);
      expect(chunks[1].index).toBe(1);
    });

    it("should handle text smaller than chunk size", () => {
      const text = "Small text";
      const chunks = chunkText(text);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe("Small text");
      expect(chunks[0].index).toBe(0);
    });

    it("should respect custom chunk size", () => {
      const text = "a".repeat(500);
      const chunks = chunkText(text, 100, 20);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].text.length).toBeLessThanOrEqual(100);
    });

    it("should apply overlap between chunks", () => {
      const text = "a".repeat(500);
      const chunks = chunkText(text, 100, 20);
      
      expect(chunks.length).toBeGreaterThan(2);
    });

    it("should handle empty text", () => {
      const chunks = chunkText("");
      expect(chunks).toHaveLength(0);
    });

    it("should trim whitespace from chunks", () => {
      const text = "  chunk one  \n\n  chunk two  ";
      const chunks = chunkText(text, 15, 5);
      
      chunks.forEach(chunk => {
        expect(chunk.text).toBe(chunk.text.trim());
      });
    });

    it("should estimate tokens correctly", () => {
      const text = "test ".repeat(100);
      const chunks = chunkText(text);
      
      chunks.forEach(chunk => {
        expect(chunk.tokenEstimate).toBe(Math.ceil(chunk.text.length / 4));
      });
    });
  });
});

describe("enrich", () => {
  describe("suggestEnrichment", () => {
    it("should return empty array for no missing info", () => {
      const result = suggestEnrichment([]);
      expect(result).toEqual([]);
    });

    it("should suggest policy documents for policy-related missing info", () => {
      const missing = ["company policy on remote work"];
      const result = suggestEnrichment(missing);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("policy/procedure document");
    });

    it("should suggest financial reports for financial missing info", () => {
      const missing = ["quarterly revenue data"];
      const result = suggestEnrichment(missing);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("quarterly financial reports");
    });

    it("should suggest contracts for contract-related missing info", () => {
      const missing = ["vendor SLA details"];
      const result = suggestEnrichment(missing);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("contract/SLA");
    });

    it("should suggest KPI dashboards for metric-related missing info", () => {
      const missing = ["customer satisfaction metrics"];
      const result = suggestEnrichment(missing);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("KPI dashboards");
    });

    it("should provide generic suggestion for unrecognized missing info", () => {
      const missing = ["random topic"];
      const result = suggestEnrichment(missing);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("Add a document that directly answers");
      expect(result[0]).toContain("random topic");
    });

    it("should handle multiple missing info items", () => {
      const missing = ["company policy", "quarterly revenue", "vendor contract"];
      const result = suggestEnrichment(missing);
      
      expect(result).toHaveLength(3);
    });

    it("should remove duplicate suggestions", () => {
      const missing = ["policy on X", "policy on Y"];
      const result = suggestEnrichment(missing);
      
      expect(result).toHaveLength(1);
    });
  });
});

describe("autoEnrich", () => {
  describe("isTrusted", () => {
    it("should return true for exact trusted domain", () => {
      process.env.TRUSTED_DOMAINS = "en.wikipedia.org";
      expect(isTrusted("https://en.wikipedia.org/api/rest_v1/page/summary/test")).toBe(true);
    });

    it("should return true for subdomain of trusted domain", () => {
      process.env.TRUSTED_DOMAINS = "wikipedia.org";
      expect(isTrusted("https://en.wikipedia.org/api/test")).toBe(true);
    });

    it("should return false for untrusted domain", () => {
      process.env.TRUSTED_DOMAINS = "wikipedia.org";
      expect(isTrusted("https://evil.com/api/test")).toBe(false);
    });

    it("should return false for invalid URL", () => {
      process.env.TRUSTED_DOMAINS = "wikipedia.org";
      expect(isTrusted("not-a-url")).toBe(false);
    });

    it("should trim whitespace from domains", () => {
      process.env.TRUSTED_DOMAINS = " wikipedia.org , britannica.com ";
      expect(isTrusted("https://en.wikipedia.org/test")).toBe(true);
    });
  });
});

describe("query helpers", () => {
  describe("extractTopicFromQuestion", () => {
    it("should extract topic from 'what is' question", () => {
      expect(extractTopicFromQuestion("What is cybersecurity?")).toBe("cybersecurity");
    });

    it("should extract topic from 'who is' question", () => {
      expect(extractTopicFromQuestion("Who is Albert Einstein?")).toBe("albert einstein");
    });

    it("should extract topic from 'how does' question", () => {
      expect(extractTopicFromQuestion("How does photosynthesis work?")).toBe("does photosynthesis work");
    });

    it("should remove question mark", () => {
      expect(extractTopicFromQuestion("What is AI?")).toBe("ai");
    });

    it("should handle questions without question words", () => {
      expect(extractTopicFromQuestion("Machine learning")).toBe("machine learning");
    });

    it("should handle empty string", () => {
      expect(extractTopicFromQuestion("")).toBe("");
    });

    it("should convert to lowercase", () => {
      expect(extractTopicFromQuestion("What is TypeScript?")).toBe("typescript");
    });

    it("should handle 'is' at start after question word removal", () => {
      expect(extractTopicFromQuestion("What is is React?")).toBe("is react");
    });
  });

  describe("extractTopicsFromMissingInfo", () => {
    it("should use fallback question when missing info is empty", () => {
      const result = extractTopicsFromMissingInfo([], "What is AI?");
      expect(result).toEqual(["ai"]);
    });

    it("should clean 'definition of' prefix", () => {
      const result = extractTopicsFromMissingInfo(["Definition of cybersecurity"], "");
      expect(result).toEqual(["cybersecurity"]);
    });

    it("should clean 'explanation of' prefix", () => {
      const result = extractTopicsFromMissingInfo(["Explanation of machine learning"], "");
      expect(result).toEqual(["machine learning"]);
    });

    it("should clean 'details on' prefix", () => {
      const result = extractTopicsFromMissingInfo(["Details on blockchain technology"], "");
      expect(result).toEqual(["blockchain technology"]);
    });

    it("should remove 'the' prefix", () => {
      const result = extractTopicsFromMissingInfo(["the internet"], "");
      expect(result).toEqual(["internet"]);
    });

    it("should remove duplicates", () => {
      const result = extractTopicsFromMissingInfo([
        "Definition of AI",
        "Explanation of AI",
        "Details on AI"
      ], "");
      expect(result).toEqual(["ai"]);
    });

    it("should limit to 3 topics", () => {
      const result = extractTopicsFromMissingInfo([
        "topic1",
        "topic2", 
        "topic3",
        "topic4",
        "topic5"
      ], "");
      expect(result).toHaveLength(3);
    });

    it("should handle mixed prefixes", () => {
      const result = extractTopicsFromMissingInfo([
        "Definition of cybersecurity",
        "Explanation of digital attacks",
        "Details on data protection"
      ], "");
      expect(result).toEqual(["cybersecurity", "digital attacks", "data protection"]);
    });

    it("should convert to lowercase", () => {
      const result = extractTopicsFromMissingInfo(["Definition of TypeScript"], "");
      expect(result).toEqual(["typescript"]);
    });
  });

  describe("processCitations", () => {
    it("should process doc_chunk citation", () => {
      const citations = [{
        source_type: "doc_chunk",
        chunk_id: "550e8400-e29b-41d4-a716-446655440000",
        document_id: "660e8400-e29b-41d4-a716-446655440000",
        excerpt: "Test excerpt"
      }];

      const result = processCitations(citations);
      
      expect(result).toHaveLength(1);
      expect(result[0].source_type).toBe("doc_chunk");
      expect(result[0].chunk_id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result[0].document_id).toBe("660e8400-e29b-41d4-a716-446655440000");
      expect(result[0].excerpt).toBe("Test excerpt");
    });

    it("should process external citation", () => {
      const citations = [{
        source_type: "external",
        url: "https://example.com",
        title: "Example",
        excerpt: "External excerpt"
      }];

      const result = processCitations(citations);
      
      expect(result).toHaveLength(1);
      expect(result[0].source_type).toBe("external");
      expect(result[0].url).toBe("https://example.com");
      expect(result[0].title).toBe("Example");
      expect(result[0].excerpt).toBe("External excerpt");
    });

    it("should truncate excerpt to 220 characters", () => {
      const longExcerpt = "a".repeat(300);
      const citations = [{
        source_type: "external",
        excerpt: longExcerpt
      }];

      const result = processCitations(citations);
      
      expect(result[0].excerpt).toHaveLength(220);
    });

    it("should filter out invalid source types", () => {
      const citations = [
        { source_type: "invalid", excerpt: "test" },
        { source_type: "doc_chunk", excerpt: "valid" }
      ];

      const result = processCitations(citations);
      
      expect(result).toHaveLength(1);
      expect(result[0].source_type).toBe("doc_chunk");
    });

    it("should filter out citations without excerpts", () => {
      const citations = [
        { source_type: "doc_chunk", excerpt: "" },
        { source_type: "doc_chunk", excerpt: "valid" }
      ];

      const result = processCitations(citations);
      
      expect(result).toHaveLength(1);
    });

    it("should only include valid UUIDs", () => {
      const citations = [{
        source_type: "doc_chunk",
        chunk_id: "not-a-uuid",
        document_id: "550e8400-e29b-41d4-a716-446655440000",
        excerpt: "test"
      }];

      const result = processCitations(citations);
      
      expect(result[0].chunk_id).toBeUndefined();
      expect(result[0].document_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("should handle null/undefined citations array", () => {
      expect(processCitations(null as any)).toEqual([]);
      expect(processCitations(undefined as any)).toEqual([]);
    });

    it("should handle empty array", () => {
      expect(processCitations([])).toEqual([]);
    });
  });
});