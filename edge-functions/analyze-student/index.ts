// ============================================================================
// Edge Function: analyze-student — تحليل مستوى الطالب + التوصيات + الخطة العلاجية
// Aggregates attempts/answers/progress, asks the model for an analysis,
// stores ai_analysis + ai_recommendations, and notifies the parent on weakness.
// POST { student_id, course_id? }
// ============================================================================
import { adminClient, userClient, chat, cors } from "../_shared/openai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { student_id, course_id } = await req.json();
    const u = userClient(req);

    // RLS ensures the caller (staff/parent/self) may read this student.
    const { data: student, error } = await u
      .from("students").select("id, org_id, grade_level, stage").eq("id", student_id).single();
    if (error || !student) return json({ error: "no access to student" }, 403);

    const admin = adminClient();
    // Gather signals.
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

    const sys =
      `أنت محلل تعليمي. حلّل أداء طالب في الصف ${student.grade_level} بناءً على المؤشرات. ` +
      `أعد JSON بالمفاتيح: mastery_pct (0-100)، understanding_level (مرتفع/متوسط/منخفض)، ` +
      `strengths (مصفوفة)، weaknesses (مصفوفة)، missing_skills (مصفوفة)، reasons (نص)، ` +
      `summary (نص)، recommendations (مصفوفة من {rec_type,title,priority,details})، ` +
      `remedial_plan (نص خطة تقوية أسبوعية).`;
    const { text, usage } = await chat(
      [{ role: "user", content: `المؤشرات: ${JSON.stringify(signals)}` }],
      { system: sys, json: true, model: "gpt-4o" },
    );
    const r = JSON.parse(text);

    // Persist analysis.
    const { data: analysis } = await admin.from("ai_analysis").insert({
      org_id: student.org_id, student_id, course_id: course_id ?? null,
      mastery_pct: r.mastery_pct, understanding_level: r.understanding_level,
      strengths: r.strengths, weaknesses: r.weaknesses,
      missing_skills: r.missing_skills, reasons: r.reasons, summary: r.summary,
    }).select("id").single();

    // Persist recommendations.
    const recs = (r.recommendations ?? []).map((x: any) => ({
      org_id: student.org_id, student_id, analysis_id: analysis?.id,
      course_id: course_id ?? null, rec_type: x.rec_type ?? "extra_exercises",
      title: x.title, payload: { details: x.details, remedial_plan: r.remedial_plan },
      priority: x.priority ?? 1,
    }));
    if (recs.length) await admin.from("ai_recommendations").insert(recs);

    // Notify parents if weak.
    if ((r.mastery_pct ?? 100) < 60) {
      const { data: links } = await admin
        .from("parent_student_links").select("parent_id, parents(account_id)")
        .eq("student_id", student_id);
      const notes = (links ?? []).map((l: any) => ({
        org_id: student.org_id, recipient_id: l.parents.account_id,
        n_type: "level_drop", channel: "in_app",
        title: "تنبيه: انخفاض مستوى الطالب",
        body: `أوصى النظام بخطة تقوية. نسبة الإتقان الحالية ${r.mastery_pct}%.`,
        data: { analysis_id: analysis?.id },
      }));
      if (notes.length) await admin.from("notifications").insert(notes);
    }

    await admin.from("ai_chat_messages").insert({
      org_id: student.org_id, student_id, role: "system", task_type: "analyze_performance",
      content: "analyze-student", tokens_in: usage?.prompt_tokens,
      tokens_out: usage?.completion_tokens, model: "gpt-4o",
    });

    return json({ analysis: r });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
