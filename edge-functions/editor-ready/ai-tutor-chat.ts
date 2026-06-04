// ============================================================================
// فطن | Edge Function: ai-tutor-chat  (نسخة مستقلة جاهزة للّصق Via Editor)
// المساعد الدراسي الذكي: حل سؤال/صورة/PDF + خطوات + أسئلة مشابهة. ملف كامل.
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
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text()}`);
  const d = await res.json();
  return { text: d.choices[0].message.content, usage: d.usage };
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
    const { student_id, message, attachment_url, attachment_kind } = await req.json();
    const u = userClient(req);
    const { data: student, error } = await u.from("students")
      .select("id, org_id, grade_level").eq("id", student_id).single();
    if (error || !student) return json({ error: "no access" }, 403);

    const admin = adminClient();
    await admin.from("ai_chat_messages").insert({ org_id: student.org_id, student_id,
      role: "user", content: message, attachment_url, task_type: "chat_solve" });

    const userContent: any[] = [{ type: "text", text: message ?? "حل المسألة في المرفق." }];
    if (attachment_url && attachment_kind === "image")
      userContent.push({ type: "image_url", image_url: { url: attachment_url } });
    else if (attachment_url)
      userContent.push({ type: "text", text: `مرفق (${attachment_kind}): ${attachment_url}` });

    const sys = `أنت معلم خصوصي صبور. ${toneForGrade(student.grade_level)} ` +
      `حلّ سؤال الطالب واشرح خطوات الحل خطوة بخطوة، ثم قدّم مثالاً إضافياً، ` +
      `وأنشئ سؤالين مشابهين للتدريب. علّم الطريقة ولا تعطِ الإجابة النهائية فقط.`;

    const { text, usage } = await chat([{ role: "user", content: userContent }],
      { system: sys, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o"), temperature: 0.3 });

    await admin.from("ai_chat_messages").insert({ org_id: student.org_id, student_id,
      role: "assistant", content: text, task_type: "chat_solve",
      tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });

    return json({ reply: text });
  } catch (e) { return json({ error: String(e) }, 500); }
});
