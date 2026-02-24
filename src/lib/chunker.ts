import type { Chunk } from "./bm25";

export interface DocumentInput {
  name: string;
  text: string;
}

/**
 * Split documents into overlapping chunks.
 *
 * Strategy: paragraph-aware splitting with fallback to character-based
 * chunking when paragraphs are too large. Overlap preserves context
 * across chunk boundaries.
 */
export function chunkDocuments(
  docs: DocumentInput[],
  chunkSize = 400,   // characters
  overlap = 80       // characters of overlap
): Chunk[] {
  const chunks: Chunk[] = [];
  let globalId = 0;

  docs.forEach((doc, docIndex) => {
    const text = doc.text.trim();
    if (!text) return;

    // Split on double newlines (paragraphs) first
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

    // Accumulate paragraphs into chunks
    let currentChunk = "";
    let currentStart = 0;
    let charPos = 0;

    for (const para of paragraphs) {
      const candidateLength = currentChunk
        ? currentChunk.length + 2 + para.length
        : para.length;

      if (candidateLength <= chunkSize) {
        if (currentChunk) {
          currentChunk += "\n\n" + para;
        } else {
          currentStart = charPos;
          currentChunk = para;
        }
      } else {
        // Flush current chunk
        if (currentChunk) {
          chunks.push({
            id: globalId++,
            text: currentChunk,
            docIndex,
            docName: doc.name,
            startChar: currentStart,
          });
        }

        // If para itself is > chunkSize, split it by characters
        if (para.length > chunkSize) {
          let pos = 0;
          while (pos < para.length) {
            const slice = para.slice(pos, pos + chunkSize);
            chunks.push({
              id: globalId++,
              text: slice,
              docIndex,
              docName: doc.name,
              startChar: charPos + pos,
            });
            pos += chunkSize - overlap;
          }
          currentChunk = "";
          currentStart = charPos + para.length;
        } else {
          currentStart = charPos;
          currentChunk = para;
        }
      }

      charPos += para.length + 2; // +2 for \n\n
    }

    // Flush remaining
    if (currentChunk) {
      chunks.push({
        id: globalId++,
        text: currentChunk,
        docIndex,
        docName: doc.name,
        startChar: currentStart,
      });
    }
  });

  return chunks;
}
