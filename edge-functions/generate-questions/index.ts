// ============================================================================
// Edge Function: generate-questions (نسخة RAG) — توليد أسئلة من المادة نفسها
// يولّد الأسئلة اعتماداً على محتوى الدرس المرفوع في المكتبة (content_chunks)،
// فتكون الأسئلة من المنهج فعلياً لا من معلومات عامة، ويخزّنها في بنك الأسئلة.
// POST { lesson_id?, course_id?, count, types:[...], difficulty, save_to_bank }
// ============================================================================
import { adminClient, userClient, chat, embed, cors } from "../_shared/openai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const { lesson_id, course_id, count = 5,
            types = ["mcq", "true_false"], difficulty = "medium",
            save_to_bank = true } = body;

    const u = userClient(req);
    const ref = lesson_id
      ? await u.from("lessons").select("id, title, org_id, course_id").eq("id", lesson_id).single()
      : await u.from("courses").select("id, title, org_id").eq("id", course_id).single();
    if (ref.error || !ref.data) return json({ error: "no access to source" }, 403);

    const admin = adminClient();

    // استرجاع RAG: مقاطع المادة/الدرس من المكتبة لتأسيس الأسئلة عليها.
    let source = "";
    if (lesson_id) {
      const [qVec] = await embed(`أسئلة عن: ${ref.data.title}`);
      const { data: matches } = await admin.rpc("match_content_chunks", {
        query_embedding: qVec, p_lesson_id: lesson_id,
        p_org_id: ref.data.org_id, match_count: 10,
      });
      source = (matches ?? []).map((m: any) => m.text).join("\n\n");
    }
    const grounded = source.trim().length > 0;

    const sys =
      `أنت مصمم تقييمات تربوي. ولّد ${count} سؤالاً بمستوى صعوبة "${difficulty}" ` +
      `للموضوع "${ref.data.title}". الأنواع المطلوبة: ${types.join(", ")}. ` +
      (grounded
        ? `استخرج الأسئلة حصراً من "المادة" المرفقة ولا تخرج عنها. `
        : `لا يوجد محتوى مرفوع، ولّد أسئلة عامة مناسبة للموضوع. `) +
      `أعد JSON: { "questions": [ { "q_type","stem","options":[{"key","text","is_correct"}], ` +
      `"correct_answer","explanation","difficulty" } ] }. ` +
      `للأسئلة المقالية اجعل options=null و correct_answer=نموذج إجابة.`;

    const userMsg = grounded
      ? `المادة:\n${source}\n\nولّد الأسئلة منها الآن.`
      : "ولّد الأسئلة الآن.";

    const { text, usage } = await chat(
      [{ role: "user", content: userMsg }],
      { system: sys, json: true, model: "gpt-4o", temperature: 0.6 },
    );
    const parsed = JSON.parse(text);
    const qs = parsed.questions ?? [];

    if (save_to_bank && qs.length) {
      // متجهات الأسئلة لتفعيل "أسئلة مشابهة" والبحث الدلالي لاحقاً.
      const vecs = await embed(qs.map((q: any) => q.stem));
      const rows = qs.map((q: any, i: number) => ({
        org_id: ref.data.org_id,
        course_id: course_id ?? ref.data.course_id ?? null,
        lesson_id: lesson_id ?? null,
        q_type: q.q_type, difficulty: q.difficulty ?? difficulty,
        stem: q.stem, options: q.options ?? null,
        correct_answer: q.correct_answer ?? null,
        explanation: q.explanation ?? null, is_ai_generated: true,
        embedding: vecs[i],
      }));
      await admin.from("questions").insert(rows);
      await admin.from("ai_chat_messages").insert({
        org_id: ref.data.org_id, role: "system", task_type: "generate_questions",
        content: `generated ${qs.length} questions grounded=${grounded}`,
        tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens, model: "gpt-4o",
      });
    }
    return json({ count: qs.length, grounded, questions: qs });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
