import { NextRequest, NextResponse } from "next/server";
import { chunkDocuments, type DocumentInput } from "@/lib/chunker";
import { bm25Search, type ScoredChunk } from "@/lib/bm25";

interface SearchRequest {
  docs: DocumentInput[];
  query: string;
  topK?: number;
}

interface SearchResponse {
  chunks: ScoredChunk[];
  totalChunks: number;
  stats: {
    docCount: number;
    totalWords: number;
    chunkCount: number;
    retrievedCount: number;
    queryTerms: string[];
  };
}

export async function POST(req: NextRequest): Promise<NextResponse<SearchResponse>> {
  const { docs, query, topK = 5 } = (await req.json()) as SearchRequest;

  if (!docs || docs.length === 0) {
    return NextResponse.json(
      { error: "No documents provided" } as unknown as SearchResponse,
      { status: 400 }
    );
  }

  if (!query?.trim()) {
    return NextResponse.json(
      { error: "No query provided" } as unknown as SearchResponse,
      { status: 400 }
    );
  }

  // Chunk all documents
  const chunks = chunkDocuments(docs);
  const totalWords = docs.reduce(
    (acc, d) => acc + d.text.split(/\s+/).length,
    0
  );

  // BM25 retrieval
  const scoredChunks = bm25Search(chunks, query, topK);

  // Extract query terms for stats
  const queryTerms = [...new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  )];

  return NextResponse.json({
    chunks: scoredChunks,
    totalChunks: chunks.length,
    stats: {
      docCount: docs.length,
      totalWords,
      chunkCount: chunks.length,
      retrievedCount: scoredChunks.length,
      queryTerms,
    },
  });
}
