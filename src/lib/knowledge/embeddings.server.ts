import {
  EMBEDDING_BATCH_MAX,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
} from "./types";

/**
 * Embeds text through the Lovable AI Gateway `/v1/embeddings` endpoint.
 * Model + dimension were verified live against the gateway before the schema
 * was written (google/gemini-embedding-001 -> 3072).
 */
export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_MAX) {
    const batch = inputs.slice(i, i + EMBEDDING_BATCH_MAX);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402)
        throw new Error("AI credits exhausted — add credits to continue ingestion.");
      if (res.status === 429)
        throw new Error("Embedding rate limit reached — retry this job shortly.");
      throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const d of sorted) {
      if (d.embedding.length !== EMBEDDING_DIMS) {
        throw new Error(
          `Embedding dimension mismatch: got ${d.embedding.length}, expected ${EMBEDDING_DIMS}`,
        );
      }
      out.push(d.embedding);
    }
  }
  return out;
}

export async function embedOne(input: string): Promise<number[]> {
  const [v] = await embedTexts([input]);
  if (!v) throw new Error("Embedding returned no vector");
  return v;
}