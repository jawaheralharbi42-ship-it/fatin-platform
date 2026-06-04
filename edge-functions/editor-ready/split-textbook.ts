// ============================================================================
// فطن | Edge Function: split-textbook  (نسخة مستقلة جاهزة للّصق Via Editor)
// يستقبل نص كتاب المادة كاملاً، ويطلب من الذكاء الاصطناعي تقسيمه إلى وحدات
// ودروس مع نص كل درس، ثم ينشئ units + lessons + lesson_contents ويفهرسها (RAG).
// POST { course_id, text }
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
  const body: any = { model: opts.model ?? (Deno.env.get("AI_MODEL") ?? "gpt-4o"), temperature: opts.temperature ?? 0.2,
    messages: opts.system ? [{ role: "system", content: opts.system }, ...messages] : messages };
  if (opts.json) body.response_format = { type: "json_object" };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text()}`);
  const d = await res.json();
  return { text: d.choices[0].message.content, usage: d.usage };
}
async function embed(input: string[]) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json" },
    body: JSON.stringify({ model: (Deno.env.get("AI_EMBED_MODEL") ?? "text-embedding-3-small"), input }) });
  if (!res.ok) throw new Error(`Embedding: ${res.status}`);
  const d = await res.json();
  return d.data.map((x: any) => x.embedding);
}
function chunkText(t: string, size = 1200, overlap = 150): string[] {
  const c = t.replace(/\s+/g, " ").trim(); const out: string[] = [];
  for (let i = 0; i < c.length; i += size - overlap) { out.push(c.slice(i, i + size)); if (i + size >= c.length) break; }
  return out.length ? out : [c];
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { course_id, text } = await req.json();
    if (!course_id || !text) return json({ error: "course_id and text required" }, 400);

    const u = userClient(req);
    const { data: course, error } = await u.from("courses")
      .select("id, org_id, title").eq("id", course_id).single();
    if (error || !course) return json({ error: "no access to course" }, 403);

    // حد أقصى للنص لتفادي تجاوز الحدود (للكتب الضخمة: قسّمها على دفعات/وحدات).
    const src = String(text).slice(0, 60000);

    const sys =
      `أنت خبير مناهج. قسّم نص كتاب مادة "${course.title}" إلى وحدات ودروس بترتيبها الطبيعي. ` +
      `أعد JSON فقط بهذا الشكل: { "units":[ { "title":"اسم الوحدة", ` +
      `"lessons":[ { "title":"اسم الدرس", "text":"النص التعليمي لهذا الدرس مستخرجاً من المصدر" } ] } ] }. ` +
      `حافظ على محتوى المصدر ولا تختلق. اجعل نص كل درس وافياً بما يكفي للشرح وتوليد الأسئلة.`;

    const { text: out, usage } = await chat(
      [{ role: "user", content: `نص الكتاب:\n${src}` }],
      { system: sys, json: true, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });
    const tree = JSON.parse(out);
    const units = tree.units ?? [];

    const admin = adminClient();
    let nUnits = 0, nLessons = 0;
    for (let ui = 0; ui < units.length; ui++) {
      const un = units[ui];
      const { data: unitRow } = await admin.from("units").insert({
        org_id: course.org_id, course_id, title: un.title || `الوحدة ${ui + 1}`, position: ui + 1,
      }).select("id").single();
      nUnits++;
      const lessons = un.lessons ?? [];
      for (let li = 0; li < lessons.length; li++) {
        const ls = lessons[li];
        const { data: lessonRow } = await admin.from("lessons").insert({
          org_id: course.org_id, unit_id: unitRow!.id, course_id,
          title: ls.title || `الدرس ${li + 1}`, position: li + 1, is_published: true,
        }).select("id").single();
        nLessons++;
        const lessonText = (ls.text || "").trim();
        if (lessonText) {
          const { data: cRow } = await admin.from("lesson_contents").insert({
            org_id: course.org_id, lesson_id: lessonRow!.id, kind: "text",
            title: "نص الدرس", body: lessonText, is_ai_generated: false,
            extraction_status: "done", extracted_chars: lessonText.length,
          }).select("id").single();
          // فهرسة دلالية (RAG)
          const chunks = chunkText(lessonText);
          const vecs = await embed(chunks);
          await admin.from("content_chunks").insert(chunks.map((t, i) => ({
            org_id: course.org_id, lesson_id: lessonRow!.id, content_id: cRow!.id,
            chunk_index: i, text: t, token_count: Math.round(t.length / 4), embedding: vecs[i],
          })));
        }
      }
    }

    await admin.from("ai_chat_messages").insert({
      org_id: course.org_id, role: "system", task_type: "content_to_lesson",
      content: `split-textbook ${course_id}: ${nUnits} units, ${nLessons} lessons`,
      tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });

    return json({ ok: true, units: nUnits, lessons: nLessons });
  } catch (e) { return json({ error: String(e) }, 500); }
});
