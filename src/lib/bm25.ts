/**
 * Okapi BM25 — industry-standard probabilistic text retrieval.
 * Used by Elasticsearch, Apache Lucene, Solr. This is the same
 * algorithm that powers most production search systems.
 *
 * BM25 parameters:
 *   k1 = 1.5  — term frequency saturation (higher = more TF weight)
 *   b  = 0.75 — length normalization (1.0 = full, 0.0 = none)
 */

export interface Chunk {
  id: number;
  text: string;
  docIndex: number;
  docName: string;
  startChar: number;
}

export interface ScoredChunk extends Chunk {
  score: number;
  termMatches: string[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2); // remove very short tokens
}

function buildIndex(chunks: Chunk[]) {
  const N = chunks.length;
  // Term frequency per document: tf[docId][term] = count
  const tf: Map<string, number>[] = chunks.map(() => new Map());
  // Document frequency: df[term] = number of docs containing term
  const df: Map<string, number> = new Map();
  // Document lengths
  const docLengths: number[] = [];
  let totalLength = 0;

  chunks.forEach((chunk, i) => {
    const tokens = tokenize(chunk.text);
    docLengths.push(tokens.length);
    totalLength += tokens.length;

    const seenTerms = new Set<string>();
    tokens.forEach((token) => {
      tf[i].set(token, (tf[i].get(token) ?? 0) + 1);
      if (!seenTerms.has(token)) {
        df.set(token, (df.get(token) ?? 0) + 1);
        seenTerms.add(token);
      }
    });
  });

  const avgdl = totalLength / N;
  return { tf, df, docLengths, avgdl, N };
}

export function bm25Search(
  chunks: Chunk[],
  query: string,
  topK: number = 5
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const k1 = 1.5;
  const b = 0.75;

  const { tf, df, docLengths, avgdl, N } = buildIndex(chunks);
  const queryTerms = [...new Set(tokenize(query))];

  const scored: ScoredChunk[] = chunks.map((chunk, i) => {
    let score = 0;
    const matchedTerms: string[] = [];

    queryTerms.forEach((term) => {
      const termTf = tf[i].get(term) ?? 0;
      const termDf = df.get(term) ?? 0;

      if (termDf === 0) return;

      // IDF with smoothing
      const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
      // TF with length normalization
      const tfNorm =
        (termTf * (k1 + 1)) /
        (termTf + k1 * (1 - b + b * (docLengths[i] / avgdl)));

      if (termTf > 0) matchedTerms.push(term);
      score += idf * tfNorm;
    });

    return { ...chunk, score, termMatches: matchedTerms };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
