# RAG Pipeline Demo

Interactive Retrieval-Augmented Generation demo that makes the full pipeline visible — no black boxes.

**Live:** https://rag-demo-nine.vercel.app

## What It Does

1. **Load documents** — paste any text (research papers, documentation, notes)
2. **Chunk** — paragraph-aware splitting with character-level fallback and overlap
3. **BM25 Retrieval** — Okapi BM25 lexical search, the same algorithm powering Elasticsearch
4. **Generate** — Claude Haiku answers with inline `[Source N]` citations

Everything is visible: chunk count, BM25 scores per retrieved chunk, matched query terms, and the final grounded answer.

## Tech Stack

- **Next.js 16** (App Router)
- **BM25** — pure TypeScript implementation (k₁=1.5, b=0.75)
- **Claude Haiku** — for generation with source citation enforcement
- **Streaming SSE** — real-time answer display

## Architecture

```
documents → chunker → chunks[] → BM25 index
                                        ↑
query → tokenize ──────────────────────┘ → top-k chunks → Claude Haiku → streaming answer
```

### BM25 vs Neural Embeddings

This demo uses BM25 (lexical retrieval), which is:
- ✅ Zero external API dependencies
- ✅ Deterministic and explainable
- ✅ Production-grade (Elasticsearch default)
- ⚠️ Vocabulary-dependent (keyword overlap required)

Production systems typically combine BM25 with neural reranking (cross-encoders like `cross-encoder/ms-marco-MiniLM-L-6-v2`) for semantic retrieval at scale.

## Local Development

```bash
npm install
echo "ANTHROPIC_API_KEY=your_key" > .env.local
npm run dev
```

## Interview Angle

Built as a portfolio demonstration of the RAG stack relevant to enterprise AI teams:
- Retrieval strategy selection and tradeoffs
- Chunking for context preservation
- Grounded generation with hallucination prevention
- Full pipeline transparency

---

Built by [Harrison Dudley-Rode](https://dudleyrode.com) · [matua-agent](https://github.com/matua-agent)
