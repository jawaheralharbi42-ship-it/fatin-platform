// ============================================================================
// Edge Function: ai-tutor-chat — المساعد الدراسي الذكي (حل الأسئلة وشرح الخطوات)
// Accepts a question (text) and/or an uploaded file/image URL (PDF/image/homework),
// returns step-by-step solution + similar practice questions, logs the turn.
// POST { student_id, message, attachment_url?, attachment_kind? }
// ============================================================================
import { adminClient, userClient, chat, cors, toneForGrade } from "../_shared/openai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { student_id, message, attachment_url, attachment_kind } = await req.json();
    const u = userClient(req);
    const { data: student, error } = await u
      .from("students").select("id, org_id, grade_level").eq("id", student_id).single();
    if (error || !student) return json({ error: "no access" }, 403);

    const admin = adminClient();

    // Log the user's turn.
    await admin.from("ai_chat_messages").insert({
      org_id: student.org_id, student_id, role: "user",
      content: message, attachment_url, task_type: "chat_solve",
    });

    // Multimodal content if an image was attached.
    const userContent: any[] = [{ type: "text", text: message ?? "حل المسألة في المرفق." }];
    if (attachment_url && attachment_kind === "image") {
      userContent.push({ type: "image_url", image_url: { url: attachment_url } });
    } else if (attachment_url) {
      userContent.push({ type: "text", text: `مرفق (${attachment_kind}): ${attachment_url}` });
    }

    const sys =
      `أنت معلم خصوصي صبور. ${toneForGrade(student.grade_level)} ` +
      `حلّ سؤال الطالب واشرح خطوات الحل خطوة بخطوة، ثم قدّم مثالاً إضافياً، ` +
      `وأنشئ سؤالين مشابهين للتدريب. لا تعطِ الإجابة النهائية فقط بل علّم الطريقة.`;

    const { text, usage } = await chat(
      [{ role: "user", content: userContent }],
      { system: sys, model: "gpt-4o", temperature: 0.3 },
    );

    await admin.from("ai_chat_messages").insert({
      org_id: student.org_id, student_id, role: "assistant", content: text,
      task_type: "chat_solve", tokens_in: usage?.prompt_tokens,
      tokens_out: usage?.completion_tokens, model: "gpt-4o",
    });

    return json({ reply: text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
