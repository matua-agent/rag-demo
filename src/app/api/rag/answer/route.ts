import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ScoredChunk } from "@/lib/bm25";

interface AnswerRequest {
  chunks: ScoredChunk[];
  query: string;
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const { chunks, query } = (await req.json()) as AnswerRequest;

  if (!chunks || chunks.length === 0) {
    return new Response(JSON.stringify({ error: "No chunks provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build context from retrieved chunks
  const context = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.docName}, relevance score: ${c.score.toFixed(2)}]\n${c.text}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are a precise, helpful assistant that answers questions based ONLY on provided source excerpts.

Rules:
1. Answer using ONLY information from the provided sources
2. Cite sources inline with [Source N] notation
3. If sources don't contain enough information, say so clearly
4. Be concise and direct
5. Never hallucinate or add information not in the sources`;

  const userMessage = `Based on these retrieved document excerpts, answer the question.

=== RETRIEVED CONTEXT ===
${context}
=== END CONTEXT ===

Question: ${query}

Answer based only on the above sources, with [Source N] citations:`;

  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
