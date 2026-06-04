// ============================================================================
// فطن | Edge Function: generate-questions  (نسخة مستقلة جاهزة للّصق Via Editor)
// توليد أسئلة من المادة نفسها (RAG) وتخزينها في بنك الأسئلة. ملف واحد كامل.
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

async function chat(messages: any[], opts: any = {}) {
  const body: any = { model: opts.model ?? (Deno.env.get("AI_MODEL") ?? "gpt-4o"), temperature: opts.temperature ?? 0.4,
    messages: opts.system ? [{ role: "system", content: opts.system }, ...messages] : messages };
  if (opts.json) body.response_format = { type: "json_object" };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text()}`);
  const d = await res.json();
  return { text: d.choices[0].message.content, usage: d.usage };
}
async function embed(input: string | string[], model = (Deno.env.get("AI_EMBED_MODEL") ?? "text-embedding-3-small")) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json" }, body: JSON.stringify({ model, input }) });
  if (!res.ok) throw new Error(`Embedding: ${res.status}`);
  const d = await res.json();
  return d.data.map((x: any) => x.embedding);
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const { lesson_id, course_id, count = 5, types = ["mcq", "true_false"],
            difficulty = "medium", save_to_bank = true } = body;

    const u = userClient(req);
    const ref = lesson_id
      ? await u.from("lessons").select("id, title, org_id, course_id").eq("id", lesson_id).single()
      : await u.from("courses").select("id, title, org_id").eq("id", course_id).single();
    if (ref.error || !ref.data) return json({ error: "no access to source" }, 403);

    const admin = adminClient();
    let source = "";
    if (lesson_id) {
      const [qVec] = await embed(`أسئلة عن: ${ref.data.title}`);
      const { data: matches } = await admin.rpc("match_content_chunks", {
        query_embedding: qVec, p_lesson_id: lesson_id, p_org_id: ref.data.org_id, match_count: 10 });
      source = (matches ?? []).map((m: any) => m.text).join("\n\n");
    }
    const grounded = source.trim().length > 0;

    const sys = `أنت مصمم تقييمات تربوي. ولّد ${count} سؤالاً بمستوى "${difficulty}" ` +
      `للموضوع "${ref.data.title}". الأنواع: ${types.join(", ")}. ` +
      (grounded ? `استخرج الأسئلة حصراً من "المادة" المرفقة ولا تخرج عنها. `
        : `لا يوجد محتوى مرفوع، ولّد أسئلة عامة مناسبة للموضوع. `) +
      `أعد JSON: { "questions":[{"q_type","stem","options":[{"key","text","is_correct"}],` +
      `"correct_answer","explanation","difficulty"}] }. للمقالي options=null.`;
    const userMsg = grounded ? `المادة:\n${source}\n\nولّد الأسئلة منها.` : "ولّد الأسئلة الآن.";

    const { text, usage } = await chat([{ role: "user", content: userMsg }],
      { system: sys, json: true, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o"), temperature: 0.6 });
    const qs = (JSON.parse(text).questions) ?? [];

    if (save_to_bank && qs.length) {
      const vecs = await embed(qs.map((q: any) => q.stem));
      const rows = qs.map((q: any, i: number) => ({
        org_id: ref.data.org_id, course_id: course_id ?? ref.data.course_id ?? null,
        lesson_id: lesson_id ?? null, q_type: q.q_type, difficulty: q.difficulty ?? difficulty,
        stem: q.stem, options: q.options ?? null, correct_answer: q.correct_answer ?? null,
        explanation: q.explanation ?? null, is_ai_generated: true, embedding: vecs[i] }));
      await admin.from("questions").insert(rows);
      await admin.from("ai_chat_messages").insert({ org_id: ref.data.org_id, role: "system",
        task_type: "generate_questions", content: `generated ${qs.length} grounded=${grounded}`,
        tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });
    }
    return json({ count: qs.length, grounded, questions: qs });
  } catch (e) { return json({ error: String(e) }, 500); }
});
