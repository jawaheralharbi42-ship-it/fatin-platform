// ============================================================================
// فطن | Edge Function: extract-content  (نسخة مستقلة جاهزة للّصق Via Editor)
// استخراج نص الملف المرفوع وفهرسته دلالياً في content_chunks (فهرسة RAG). ملف كامل.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const adminClient = () => createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const userClient = (req: Request) => createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: req.headers.get("Authorization")! } } });

async function embed(input: string | string[], model = (Deno.env.get("AI_EMBED_MODEL") ?? "text-embedding-3-small")) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json" }, body: JSON.stringify({ model, input }) });
  if (!res.ok) throw new Error(`Embedding: ${res.status}`);
  const d = await res.json();
  return d.data.map((x: any) => x.embedding);
}
function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) {
    chunks.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return chunks.length ? chunks : [clean];
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function extractFromStorage(admin: any, path: string, kind: string): Promise<string> {
  const { data } = await admin.storage.from("library").createSignedUrl(path, 120);
  if (!data?.signedUrl) return "";
  const svc = Deno.env.get("EXTRACTION_SERVICE_URL");
  if (!svc) return "";
  const r = await fetch(svc, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: data.signedUrl, kind }) });
  if (!r.ok) return "";
  return (await r.json()).text ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { content_id, raw_text } = await req.json();
    const u = userClient(req);
    const { data: content, error } = await u.from("lesson_contents")
      .select("id, lesson_id, org_id, kind, storage_path, body").eq("id", content_id).single();
    if (error || !content) return json({ error: "no access to content" }, 403);

    const admin = adminClient();
    await admin.from("lesson_contents").update({ extraction_status: "processing" }).eq("id", content_id);

    let text = content.body ?? raw_text ?? "";
    if (!text && content.storage_path)
      text = await extractFromStorage(admin, content.storage_path, content.kind);
    if (!text.trim()) {
      await admin.from("lesson_contents").update({ extraction_status: "error" }).eq("id", content_id);
      return json({ error: "no extractable text" }, 422);
    }

    const chunks = chunkText(text);
    const vectors = await embed(chunks);
    await admin.from("content_chunks").delete().eq("content_id", content_id);
    const rows = chunks.map((t, i) => ({ org_id: content.org_id, lesson_id: content.lesson_id,
      content_id, chunk_index: i, text: t, token_count: Math.round(t.length / 4), embedding: vectors[i] }));
    await admin.from("content_chunks").insert(rows);
    await admin.from("lesson_contents").update({ extraction_status: "done",
      extracted_chars: text.length }).eq("id", content_id);

    return json({ ok: true, chunks: chunks.length, chars: text.length });
  } catch (e) { return json({ error: String(e) }, 500); }
});
