// ============================================================================
// فطن | Edge Function: analyze-student  (نسخة مستقلة جاهزة للّصق Via Editor)
// تحليل مستوى الطالب + التوصيات + الخطة العلاجية + إشعار ولي الأمر. ملف كامل.
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
const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { student_id, course_id } = await req.json();
    const u = userClient(req);
    const { data: student, error } = await u.from("students")
      .select("id, org_id, grade_level, stage").eq("id", student_id).single();
    if (error || !student) return json({ error: "no access to student" }, 403);

    const admin = adminClient();
    const [{ data: attempts }, { data: progress }, { data: answers }] = await Promise.all([
      admin.from("attempts").select("assessment_id, percentage, duration_sec, attempt_no, submitted_at")
        .eq("student_id", student_id).order("submitted_at", { ascending: false }).limit(50),
      admin.from("student_progress").select("course_id, completion_pct, mastery_pct, time_spent_sec")
        .eq("student_id", student_id),
      admin.from("answers").select("is_correct, time_spent_sec, question_id")
        .eq("student_id", student_id).limit(200),
    ]);
    const correct = (answers ?? []).filter((a) => a.is_correct).length;
    const total = (answers ?? []).length || 1;
    const signals = {
      avg_score: avg((attempts ?? []).map((a) => a.percentage ?? 0)),
      accuracy: Math.round((correct / total) * 100),
      avg_attempts: avg((attempts ?? []).map((a) => a.attempt_no ?? 1)),
      avg_time_sec: avg((answers ?? []).map((a) => a.time_spent_sec ?? 0)),
      completion: avg((progress ?? []).map((p) => p.completion_pct ?? 0)),
    };

    const sys = `أنت محلل تعليمي. حلّل أداء طالب في الصف ${student.grade_level} بناءً على المؤشرات. ` +
      `أعد JSON: mastery_pct (0-100), understanding_level (مرتفع/متوسط/منخفض), strengths (مصفوفة), ` +
      `weaknesses (مصفوفة), missing_skills (مصفوفة), reasons (نص), summary (نص), ` +
      `recommendations (مصفوفة {rec_type,title,priority,details}), remedial_plan (نص خطة أسبوعية).`;
    const { text, usage } = await chat([{ role: "user", content: `المؤشرات: ${JSON.stringify(signals)}` }],
      { system: sys, json: true, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });
    const r = JSON.parse(text);

    const { data: analysis } = await admin.from("ai_analysis").insert({
      org_id: student.org_id, student_id, course_id: course_id ?? null,
      mastery_pct: r.mastery_pct, understanding_level: r.understanding_level,
      strengths: r.strengths, weaknesses: r.weaknesses, missing_skills: r.missing_skills,
      reasons: r.reasons, summary: r.summary }).select("id").single();

    const recs = (r.recommendations ?? []).map((x: any) => ({
      org_id: student.org_id, student_id, analysis_id: analysis?.id, course_id: course_id ?? null,
      rec_type: x.rec_type ?? "extra_exercises", title: x.title,
      payload: { details: x.details, remedial_plan: r.remedial_plan }, priority: x.priority ?? 1 }));
    if (recs.length) await admin.from("ai_recommendations").insert(recs);

    if ((r.mastery_pct ?? 100) < 60) {
      const { data: links } = await admin.from("parent_student_links")
        .select("parent_id, parents(account_id)").eq("student_id", student_id);
      const notes = (links ?? []).map((l: any) => ({
        org_id: student.org_id, recipient_id: l.parents.account_id, n_type: "level_drop",
        channel: "in_app", title: "تنبيه: انخفاض مستوى الطالب",
        body: `أوصى النظام بخطة تقوية. نسبة الإتقان ${r.mastery_pct}%.`,
        data: { analysis_id: analysis?.id } }));
      if (notes.length) await admin.from("notifications").insert(notes);
    }

    await admin.from("ai_chat_messages").insert({ org_id: student.org_id, student_id, role: "system",
      task_type: "analyze_performance", content: "analyze-student",
      tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens, model: (Deno.env.get("AI_MODEL") ?? "gpt-4o") });

    return json({ analysis: r });
  } catch (e) { return json({ error: String(e) }, 500); }
});
