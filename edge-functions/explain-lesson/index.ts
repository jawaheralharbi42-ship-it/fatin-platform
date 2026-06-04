// ============================================================================
// Edge Function: explain-lesson (نسخة RAG) — شرح الدرس من المكتبة الداخلية
// يبني الشرح/التبسيط/الأمثلة/الأسئلة اعتماداً على المحتوى المرفوع لهذا الدرس
// (content_chunks) وليس من معلومات عامة، ثم يخزّن النتائج مؤقتاً.
// POST { lesson_id, audience_grade? }
// ============================================================================
import { adminClient, userClient, chat, embed, cors, toneForGrade } from "../_shared/openai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { lesson_id, audience_grade } = await req.json();
    const u = userClient(req);            // RLS: هل يستطيع المستخدم قراءة هذا الدرس؟
    const { data: lesson, error } = await u
      .from("lessons")
      .select("id, title, org_id, course_id, courses(grade_level, subject)")
      .eq("id", lesson_id).single();
    if (error || !lesson) return json({ error: "lesson not found / no access" }, 404);

    const grade = audience_grade ?? lesson.courses?.grade_level ?? 7;
    const admin = adminClient();

    // 1) أعد المحتوى المخزّن مؤقتاً إن وُجد.
    const { data: cached } = await admin
      .from("lesson_contents").select("ai_variant, body")
      .eq("lesson_id", lesson_id).eq("is_ai_generated", true);
    if (cached && cached.length >= 3) return json({ cached: true, contents: cached });

    // 2) استرجاع RAG: اجلب أهم مقاطع المكتبة الخاصة بهذا الدرس.
    const [qVec] = await embed(`اشرح درس: ${lesson.title}`);
    const { data: matches } = await admin.rpc("match_content_chunks", {
      query_embedding: qVec, p_lesson_id: lesson_id,
      p_org_id: lesson.org_id, match_count: 8,
    });
    const source = (matches ?? []).map((m: any, i: number) => `[${i + 1}] ${m.text}`).join("\n\n");
    const grounded = source.trim().length > 0;

    // 3) ولّد المحتوى — مع إلزام النموذج بالاعتماد على المصدر فقط إن توفّر.
    const sys =
      `أنت معلم خبير. ${toneForGrade(grade)} ` +
      (grounded
        ? `اعتمد حصراً على "المصدر" المرفق من مكتبة المدرسة ولا تُضف معلومات خارجه. ` +
          `إن نقص شيء قل "غير مذكور في المادة". `
        : `لا يوجد محتوى مرفوع لهذا الدرس بعد، اشرح الموضوع بشكل عام مناسب للمنهج. `) +
      `الدرس: "${lesson.title}" لمادة ${lesson.courses?.subject} للصف ${grade}. ` +
      `أعد JSON بالمفاتيح: explanation, simplified, audio_script, ` +
      `examples (مصفوفة), practice (مصفوفة أسئلة قصيرة).`;

    const userMsg = grounded
      ? `المصدر من المكتبة:\n${source}\n\nولّد المحتوى التعليمي اعتماداً عليه.`
      : `ولّد المحتوى للدرس: ${lesson.title}`;

    const { text, usage } = await chat(
      [{ role: "user", content: userMsg }],
      { system: sys, json: true, model: "gpt-4o" },
    );
    const out = JSON.parse(text);

    // 4) خزّن النسخ.
    const rows = [
      { variant: "explanation", body: out.explanation },
      { variant: "simplified", body: out.simplified },
      { variant: "audio_script", body: out.audio_script },
      { variant: "examples", body: JSON.stringify(out.examples) },
      { variant: "practice", body: JSON.stringify(out.practice) },
    ].map((r) => ({
      lesson_id, org_id: lesson.org_id, kind: "text",
      is_ai_generated: true, ai_variant: r.variant, body: r.body,
    }));
    await admin.from("lesson_contents").insert(rows);

    await admin.from("ai_chat_messages").insert({
      org_id: lesson.org_id, role: "system", task_type: "explain",
      content: `explain-lesson ${lesson_id} grounded=${grounded}`,
      tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens, model: "gpt-4o",
    });

    return json({ cached: false, grounded, used_chunks: (matches ?? []).length, contents: out });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
