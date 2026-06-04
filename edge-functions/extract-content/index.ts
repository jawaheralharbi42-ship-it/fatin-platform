// ============================================================================
// Edge Function: extract-content — استخراج نص الملف المرفوع وفهرسته دلالياً
// يحوّل ملف الدرس (PDF/Word/PPT/نص) إلى مقاطع + متجهات تُخزَّن في content_chunks
// حتى يبني عليها الذكاء الاصطناعي الشرح والأسئلة (خطوة فهرسة RAG).
// POST { content_id }   (يُستدعى تلقائياً بعد رفع ملف للمكتبة)
// ----------------------------------------------------------------------------
// ملاحظة: استخراج نص PDF/Word يتم عبر خدمة استخراج (مثل unstructured / tika)
// أو دالة Postgres مساعدة. هنا نوضّح التدفّق ونستقبل النص الجاهز إن وُجد.
// ============================================================================
import { adminClient, userClient, embed, chunkText, cors } from "../_shared/openai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { content_id, raw_text } = await req.json();
    const u = userClient(req);

    // تحقّق صلاحية الطاقم على هذا المحتوى عبر RLS
    const { data: content, error } = await u
      .from("lesson_contents")
      .select("id, lesson_id, org_id, kind, storage_path, body")
      .eq("id", content_id).single();
    if (error || !content) return json({ error: "no access to content" }, 403);

    const admin = adminClient();
    await admin.from("lesson_contents")
      .update({ extraction_status: "processing" }).eq("id", content_id);

    // 1) احصل على النص: من body مباشرة، أو raw_text المُرسل من خدمة الاستخراج،
    //    أو استخرجه من الملف في التخزين (PDF/Word/PPT) عبر خدمة خارجية.
    let text = content.body ?? raw_text ?? "";
    if (!text && content.storage_path) {
      text = await extractFromStorage(admin, content.storage_path, content.kind);
    }
    if (!text.trim()) {
      await admin.from("lesson_contents")
        .update({ extraction_status: "error" }).eq("id", content_id);
      return json({ error: "no extractable text" }, 422);
    }

    // 2) قسّم النص إلى مقاطع ثم احسب المتجهات دفعة واحدة.
    const chunks = chunkText(text);
    const vectors = await embed(chunks);

    // 3) خزّن المقاطع (احذف القديم لنفس المحتوى أولاً لتفادي التكرار).
    await admin.from("content_chunks").delete().eq("content_id", content_id);
    const rows = chunks.map((t, i) => ({
      org_id: content.org_id, lesson_id: content.lesson_id, content_id,
      chunk_index: i, text: t, token_count: Math.round(t.length / 4),
      embedding: vectors[i],
    }));
    await admin.from("content_chunks").insert(rows);

    await admin.from("lesson_contents").update({
      extraction_status: "done", extracted_chars: text.length,
    }).eq("id", content_id);

    return json({ ok: true, chunks: chunks.length, chars: text.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// نقطة ربط خدمة الاستخراج (PDF/Word/PPT). استبدلها بمزوّدك المفضّل.
async function extractFromStorage(admin: any, path: string, kind: string): Promise<string> {
  const { data } = await admin.storage.from("library").createSignedUrl(path, 120);
  if (!data?.signedUrl) return "";
  // مثال: استدعاء خدمة استخراج تُرجع نصاً عادياً من الملف.
  const svc = Deno.env.get("EXTRACTION_SERVICE_URL");
  if (!svc) return "";                       // إن لم تُضبط الخدمة نعيد فارغاً (يُمرَّر raw_text بدلاً منها)
  const r = await fetch(svc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: data.signedUrl, kind }),
  });
  if (!r.ok) return "";
  const j = await r.json();
  return j.text ?? "";
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
