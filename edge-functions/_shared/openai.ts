// ============================================================================
// منصة فطن | Fatin — _shared/openai.ts
// Shared helpers for Supabase Edge Functions (Deno runtime).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Admin client (service_role) — bypasses RLS, use only server-side.
export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// User-scoped client — respects RLS using the caller's JWT.
export function userClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export interface ChatOptions {
  model?: string;
  temperature?: number;
  json?: boolean;
  system?: string;
}

// Thin wrapper around OpenAI Chat Completions.
export async function chat(
  messages: { role: string; content: unknown }[],
  opts: ChatOptions = {},
): Promise<{ text: string; usage: any }> {
  const body: Record<string, unknown> = {
    model: opts.model ?? "gpt-4o",
    temperature: opts.temperature ?? 0.4,
    messages: opts.system
      ? [{ role: "system", content: opts.system }, ...messages]
      : messages,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { text: data.choices[0].message.content, usage: data.usage };
}

// Create embeddings for one or more texts (RAG indexing & retrieval).
export async function embed(
  input: string | string[],
  model = "text-embedding-3-small",
): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`Embedding error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

// Split long text into overlapping chunks (~chars) for embedding.
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) {
    chunks.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return chunks.length ? chunks : [clean];
}

// Age-appropriate tone instruction by grade.
export function toneForGrade(grade: number): string {
  if (grade <= 6) return "استخدم لغة بسيطة جداً وأمثلة من الحياة اليومية ومفردات مناسبة لطفل.";
  if (grade <= 9) return "استخدم لغة واضحة ومتوسطة الصعوبة مع أمثلة عملية.";
  return "استخدم لغة أكاديمية دقيقة مع تعريفات وأمثلة متقدمة.";
}
