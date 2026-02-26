import { NextRequest } from "next/server";
import type { ScoredChunk } from "@/lib/bm25";

interface AnswerRequest {
  chunks: ScoredChunk[];
  query: string;
}

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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return new Response(JSON.stringify({ error: `Anthropic API error: ${error}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (
                  parsed.type === "content_block_delta" &&
                  parsed.delta?.type === "text_delta"
                ) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`)
                  );
                }
              } catch {}
            }
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
