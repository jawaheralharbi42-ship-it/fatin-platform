// ============================================================================
// فطن | Edge Function: explain-lesson  (نسخة مستقلة جاهزة للّصق في Via Editor)
// شرح الدرس من المكتبة الداخلية (RAG). ملف واحد كامل — لا يحتاج _shared.
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
const toneForGrade = (g: number) => g <= 6
  ? "استخدم لغة بسيطة جداً وأمثلة من الحياة اليومية."
  : g <= 9 ? "استخدم لغة واضحة ومتوسطة مع أمثلة عملية."
  : "استخدم لغة أكاديمية دقيقة مع تعريفات وأمثلة متقدمة.";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { lesson_id, audience_grade } = await req.json();
    const u = userClient(req);
    const { data: lesson, error } = await u.from("lessons")
      .select("id, title, org_id, course_id, courses(grade_level, subject)")
      .eq("id", lesson_id).single();
    if (error || !lesson) return json({ error: "lesson not found / no access" }, 404);

    const grade = audience_grade ?? lesson.courses?.grade_level ?? 7;
    const admin = adminClient();

    const { data: cached } = await admin.from("lesson_contents")
      .select("ai_variant, body").eq("lesson_id", lesson_id).eq("is_ai_generated", true);
    if (cached && cached.length >= 3) return json({ cached: true, contents: cached });

    const [qVec] = await embed(`اشرح درس: ${lesson.title}`);
    const { data: matches } = await admin.rpc("match_content_chunks", {
      query_embedding: qVec, p_lesson_id: lesson_id, p_org_id: lesson.org_id, match_count: 8 });
    const source = (matches ?? []).map((m: any, i: number) => `[${i + 1}] ${m.text}`).join("\n\n");
    const grounded = source.trim().length > 0;

    const sys = `أنت معلم خبير. ${toneForGrade(grade)} ` +
      (grounded ? `اعتمد حصراً على "المصدر" المرفق من مكتبة المدرسة ولا تُضف من خارجه. ` +
        `إن نقص شيء قل "غير مذكور في المادة". `
        : `لا يوجد محتوى مرفوع بعد، اشرح الموضوع بشكل عام مناسب للمنهج. `) +
      `الدرس: "${lesson.title}" لمادة ${lesson.courses?.subject} للصف ${grade}. ` +
      `أعد JSON: explanation, simplified, audio_script, examples (مصفوفة), practice (مصفوفة).`;
    const userMsg = grounded
      ? `المصدر:\n${source}\n\nولّد المحتوى اعتماداً عليه.`
      : `ولّد المحتوى للدرس: ${lesson.title}`;

    const { text, usage } = await chat([{ role: "user", content: userMsg }],
      { system: sys, json: true, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });
    const out = JSON.parse(text);

    const rows = [
      { v: "explanation", b: out.explanation }, { v: "simplified", b: out.simplified },
      { v: "audio_script", b: out.audio_script }, { v: "examples", b: JSON.stringify(out.examples) },
      { v: "practice", b: JSON.stringify(out.practice) },
    ].map((r) => ({ lesson_id, org_id: lesson.org_id, kind: "text",
      is_ai_generated: true, ai_variant: r.v, body: r.b }));
    await admin.from("lesson_contents").insert(rows);
    await admin.from("ai_chat_messages").insert({ org_id: lesson.org_id, role: "system",
      task_type: "explain", content: `explain-lesson ${lesson_id} grounded=${grounded}`,
      tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });

    return json({ cached: false, grounded, used_chunks: (matches ?? []).length, contents: out });
  } catch (e) { return json({ error: String(e) }, 500); }
});
