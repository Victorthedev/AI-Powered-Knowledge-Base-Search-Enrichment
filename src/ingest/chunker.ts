export type Chunk = { index: number; text: string; tokenEstimate: number };

export function chunkText(text: string, chunkSize = 1200, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  let idx = 0;

  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    const chunk = text.slice(i, end).trim();
    if (chunk.length > 0) {
      chunks.push({
        index: idx++,
        text: chunk,
        tokenEstimate: Math.ceil(chunk.length / 4)
      });
    }
    i = end - overlap;
    if (i < 0) i = 0;
    if (end === text.length) break;
  }
  return chunks;
}
