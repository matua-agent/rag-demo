"use client";

import { useState, useRef } from "react";
import type { ScoredChunk } from "@/lib/bm25";

const SAMPLE_DOCS = [
  {
    name: "Durability in Endurance Sport (Research Paper Abstract)",
    text: `Durability in endurance sport refers to the ability to maintain physiological function and performance output over extended exercise durations. Recent research has demonstrated that athletes with superior durability—defined as the capacity to resist exercise-induced physiological perturbations—achieve better competitive outcomes in long-duration events.

The ventilatory threshold (VT1) serves as a critical demarcation of exercise intensity, representing the point at which ventilation begins to increase disproportionately relative to oxygen consumption. Athletes who maintain stable VT1 over multi-hour efforts demonstrate what researchers term "high durability."

Carbohydrate oxidation rates play a pivotal role in sustaining high-intensity exercise. Studies using continuous gas exchange measurement have quantified that athletes consuming 90-120g/hour of mixed carbohydrates during events exceeding 4 hours can attenuate the drift in oxygen cost of locomotion, commonly referred to as "aerobic decoupling."

Training load modeling using the Banister impulse-response model provides a framework for quantifying the cumulative effect of training. The model uses two compartments: Fitness (CTL - chronic training load, typically 42-day exponential weighted average) and Fatigue (ATL - acute training load, typically 7-day weighted average). Training Stress Balance (TSB = CTL - ATL) indicates readiness for performance.

Heart rate drift relative to power output (aerobic decoupling) is an objective marker of durability. Athletes with less than 5% decoupling during 4-hour submaximal efforts show superior race performance correlations compared to those exhibiting greater than 10% decoupling.`,
  },
  {
    name: "AI Orchestration Patterns (Engineering Notes)",
    text: `Multi-stage LLM pipelines represent the foundational architecture for enterprise AI applications. Unlike single-prompt interactions, orchestration patterns chain specialized model calls where each stage builds context for the next.

The Extract-Analyze-Synthesize-Action pattern is particularly effective for document processing workflows. In stage one (Extract), the model identifies key entities, relationships, and facts. Stage two (Analyze) performs deeper reasoning about implications and patterns. Stage three (Synthesize) creates coherent summaries integrating multiple perspectives. The final stage (Action Items) converts insights into concrete next steps.

Retrieval-Augmented Generation (RAG) solves the hallucination problem in document-grounded applications. Rather than relying on parametric knowledge alone, RAG retrieves relevant source material and conditions generation on it. The retrieval step typically uses either lexical methods (BM25, TF-IDF) or neural methods (dense embeddings + cosine similarity).

BM25 (Best Matching 25) is the industry standard for lexical retrieval. It improves on raw TF-IDF by incorporating document length normalization and term frequency saturation. Parameters k1 (typically 1.5) and b (typically 0.75) control these factors. BM25 is used by Elasticsearch, Apache Lucene, Solr, and most production search systems.

Context window management is critical at scale. Modern LLMs support 100k-200k token windows but retrieval prevents sending entire corpora. Retrieved chunks should overlap by 15-20% to preserve context at boundaries. Reranking (using a cross-encoder) after initial retrieval significantly improves precision.

Model routing—directing different query types to specialized models—reduces cost while maintaining quality. Simple queries route to smaller models (Claude Haiku, GPT-4o-mini); complex reasoning tasks route to larger models (Claude Sonnet, GPT-4o).`,
  },
];

interface RetrievalStats {
  docCount: number;
  totalWords: number;
  chunkCount: number;
  retrievedCount: number;
  queryTerms: string[];
}

type Stage = "idle" | "chunking" | "retrieving" | "generating" | "done";

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 font-mono w-10 text-right">
        {score.toFixed(2)}
      </span>
    </div>
  );
}

function PipelineStep({
  num,
  label,
  active,
  done,
}: {
  num: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
          ${done ? "bg-violet-600 text-white" : active ? "bg-blue-500 text-white ring-2 ring-blue-400 ring-offset-1 ring-offset-zinc-950" : "bg-zinc-800 text-zinc-500"}`}
      >
        {done ? "✓" : num}
      </div>
      <span
        className={`text-sm transition-colors ${active ? "text-white font-medium" : done ? "text-violet-400" : "text-zinc-500"}`}
      >
        {label}
      </span>
    </div>
  );
}

export default function RagDemo() {
  const [docs, setDocs] = useState<{ name: string; text: string }[]>([]);
  const [addingDoc, setAddingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocText, setNewDocText] = useState("");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [chunks, setChunks] = useState<ScoredChunk[]>([]);
  const [stats, setStats] = useState<RetrievalStats | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const answerRef = useRef("");

  function loadSamples() {
    setDocs(SAMPLE_DOCS);
  }

  function addDoc() {
    if (!newDocName.trim() || !newDocText.trim()) return;
    setDocs((prev) => [...prev, { name: newDocName.trim(), text: newDocText.trim() }]);
    setNewDocName("");
    setNewDocText("");
    setAddingDoc(false);
  }

  function removeDoc(i: number) {
    setDocs((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function runPipeline() {
    if (!query.trim() || docs.length === 0) return;
    setError(null);
    setAnswer("");
    answerRef.current = "";
    setChunks([]);
    setStats(null);

    // Stage 1: Chunking (instant, just visual)
    setStage("chunking");
    await new Promise((r) => setTimeout(r, 600));

    // Stage 2: BM25 Retrieval
    setStage("retrieving");
    const searchRes = await fetch("/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docs, query, topK: 5 }),
    });

    if (!searchRes.ok) {
      setError("Retrieval failed");
      setStage("idle");
      return;
    }

    const searchData = await searchRes.json();
    setChunks(searchData.chunks);
    setStats(searchData.stats);

    if (searchData.chunks.length === 0) {
      setAnswer("No relevant content found in your documents for this query. Try different search terms.");
      setStage("done");
      return;
    }

    await new Promise((r) => setTimeout(r, 300));

    // Stage 3: Generation
    setStage("generating");
    const answerRes = await fetch("/api/rag/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunks: searchData.chunks, query }),
    });

    if (!answerRes.ok || !answerRes.body) {
      setError("Generation failed");
      setStage("idle");
      return;
    }

    const reader = answerRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6);
        if (raw === "[DONE]") break;
        try {
          const { text } = JSON.parse(raw);
          if (text) {
            answerRef.current += text;
            setAnswer(answerRef.current);
          }
        } catch {}
      }
    }

    setStage("done");
  }

  const maxScore = chunks.length > 0 ? chunks[0].score : 1;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-zinc-900/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <span className="text-2xl">🔍</span> RAG Pipeline Demo
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              BM25 Retrieval + Claude Haiku Generation · Full pipeline, no black boxes
            </p>
          </div>
          <a
            href="https://github.com/matua-agent/rag-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-zinc-700 rounded px-3 py-1.5"
          >
            View Source
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Explainer */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold text-sm text-zinc-300 mb-2">How It Works</h2>
          <div className="flex gap-4 flex-wrap">
            {[
              { icon: "📄", label: "1. Load Docs", desc: "Paste any text documents" },
              { icon: "✂️", label: "2. Chunk", desc: "Split into overlapping segments" },
              { icon: "⚡", label: "3. BM25 Search", desc: "Okapi BM25 lexical retrieval" },
              { icon: "🤖", label: "4. Generate", desc: "Claude Haiku with source citations" },
            ].map((step) => (
              <div key={step.label} className="flex items-start gap-2 flex-1 min-w-[140px]">
                <span className="text-lg">{step.icon}</span>
                <div>
                  <div className="text-xs font-semibold text-zinc-200">{step.label}</div>
                  <div className="text-xs text-zinc-500">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Documents */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-200">Documents</h2>
              <div className="flex gap-2">
                {docs.length === 0 && (
                  <button
                    onClick={loadSamples}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded px-3 py-1.5 transition-colors"
                  >
                    Load samples
                  </button>
                )}
                <button
                  onClick={() => setAddingDoc(true)}
                  className="text-xs bg-blue-600 hover:bg-blue-500 rounded px-3 py-1.5 transition-colors"
                >
                  + Add doc
                </button>
              </div>
            </div>

            {docs.length === 0 && (
              <div className="border border-dashed border-zinc-700 rounded-xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No documents yet.</p>
                <button
                  onClick={loadSamples}
                  className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Load sample documents →
                </button>
              </div>
            )}

            {docs.map((doc, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 relative group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{doc.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {doc.text.split(/\s+/).length} words ·{" "}
                      {Math.ceil(doc.text.length / 400)} chunks
                    </p>
                  </div>
                  <button
                    onClick={() => removeDoc(i)}
                    className="text-zinc-600 hover:text-red-400 transition-colors text-xs opacity-0 group-hover:opacity-100"
                  >
                    remove
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{doc.text}</p>
              </div>
            ))}

            {addingDoc && (
              <div className="bg-zinc-900 border border-blue-800/50 rounded-lg p-4 space-y-3">
                <input
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Document name..."
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                />
                <textarea
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="Paste document text here..."
                  rows={6}
                  value={newDocText}
                  onChange={(e) => setNewDocText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={addDoc}
                    className="text-xs bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingDoc(false)}
                    className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Query */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-200">Query</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-600"
                  placeholder="Ask a question about your documents..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runPipeline()}
                />
                <button
                  onClick={runPipeline}
                  disabled={!query.trim() || docs.length === 0 || stage !== "idle" && stage !== "done"}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {stage === "chunking" || stage === "retrieving" || stage === "generating"
                    ? "Running..."
                    : "Run RAG →"}
                </button>
              </div>
              {docs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {[
                    "What is aerobic decoupling?",
                    "How does BM25 work?",
                    "What is carbohydrate oxidation?",
                    "Explain the Banister model",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuery(q)}
                      className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded px-2 py-1 transition-colors text-zinc-400"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Pipeline + Results */}
          <div className="space-y-4">
            {/* Pipeline stages */}
            {stage !== "idle" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Pipeline
                </h3>
                <div className="space-y-2">
                  <PipelineStep
                    num={1}
                    label="Chunk Documents"
                    active={stage === "chunking"}
                    done={stage === "retrieving" || stage === "generating" || stage === "done"}
                  />
                  <PipelineStep
                    num={2}
                    label="BM25 Retrieval"
                    active={stage === "retrieving"}
                    done={stage === "generating" || stage === "done"}
                  />
                  <PipelineStep
                    num={3}
                    label="Generate Answer (Claude Haiku)"
                    active={stage === "generating"}
                    done={stage === "done"}
                  />
                </div>

                {stats && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-blue-400">{stats.chunkCount}</div>
                      <div className="text-xs text-zinc-500">chunks</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-violet-400">{stats.retrievedCount}</div>
                      <div className="text-xs text-zinc-500">retrieved</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-emerald-400">{stats.totalWords.toLocaleString()}</div>
                      <div className="text-xs text-zinc-500">words indexed</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Retrieved Chunks */}
            {chunks.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Retrieved Chunks · BM25 Scores
                </h3>
                <div className="space-y-2">
                  {chunks.map((chunk, i) => (
                    <div
                      key={chunk.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-violet-400">
                          Source {i + 1}
                        </span>
                        <span className="text-xs text-zinc-500">{chunk.docName}</span>
                      </div>
                      <ScoreBar score={chunk.score} max={maxScore} />
                      {chunk.termMatches.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {chunk.termMatches.slice(0, 6).map((term) => (
                            <span
                              key={term}
                              className="text-xs bg-blue-950/60 text-blue-300 border border-blue-800/40 rounded px-1.5 py-0.5"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-zinc-400 mt-2 line-clamp-3">
                        {chunk.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Answer */}
            {(answer || stage === "generating") && (
              <div className="bg-zinc-900 border border-violet-900/50 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3">
                  Generated Answer
                </h3>
                <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {answer}
                  {stage === "generating" && (
                    <span className="inline-block w-1.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            {stage === "idle" && !answer && (
              <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-600 text-sm">
                Add documents and run a query to see the RAG pipeline in action.
              </div>
            )}
          </div>
        </div>

        {/* Tech note */}
        <div className="border-t border-zinc-800/60 pt-6 text-xs text-zinc-500 space-y-1">
          <p className="font-semibold text-zinc-400">Under the hood:</p>
          <p>
            <strong className="text-zinc-300">Retrieval:</strong> Okapi BM25 (k₁=1.5, b=0.75) — the same algorithm powering Elasticsearch and Apache Lucene. 
            Production systems often layer neural reranking (cross-encoders) on top of BM25.
          </p>
          <p>
            <strong className="text-zinc-300">Chunking:</strong> Paragraph-aware splitting with character-level fallback, ~400-char chunks.
            Overlap prevents context loss at boundaries.
          </p>
          <p>
            <strong className="text-zinc-300">Generation:</strong> Claude Haiku 3.5 with source-citation-enforced system prompt. 
            Zero hallucination risk from knowledge not present in retrieved chunks.
          </p>
        </div>
      </main>
    </div>
  );
}
