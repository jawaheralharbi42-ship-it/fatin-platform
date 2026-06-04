# فطن — منصة تعليمية ذكية | Fatin — Smart Learning Platform

منصة تعليمية متعددة المستأجرين للمدارس ومراكز التعليم، عربية بالكامل (RTL)، يقودها الذكاء الاصطناعي في الشرح والتقييم والتحليل والتوصيات.

A multi-tenant educational SaaS for schools, Arabic-first (RTL), with AI driving explanation, assessment, analysis, and recommendations.

---

## ✨ المميزات | Features

- **مكتبة تعليمية**: مواد ← وحدات ← دروس، مع رفع محتوى (PDF/نص).
- **استيراد ذكي**: رفع كتاب PDF كامل → الذكاء الاصطناعي يقسّمه لوحدات ودروس تلقائياً.
- **شرح بالذكاء الاصطناعي**: شرح نصي، تبسيط حسب العمر، أمثلة، أسئلة تدريبية — مؤسّس على محتوى المنهج (RAG).
- **توليد الأسئلة**، **تحليل أداء الطالب**، **المساعد الدراسي الذكي**.
- **أدوار متعددة**: مدير، مشرف، معلم، ولي أمر، طالب — مع صلاحيات RBAC و RLS.
- واجهة عربية RTL متجاوبة بألوان هادئة.

## 🧱 التقنيات | Tech Stack

- **الواجهة**: HTML + React (عبر CDN) — ملف واحد مستقل.
- **الخلفية**: Supabase (PostgreSQL 17 + Auth + Storage + Edge Functions).
- **الذكاء الاصطناعي**: OpenAI (GPT-4o + embeddings) — قابل للتبديل عبر إعداد واحد.
- **البحث الدلالي**: pgvector (RAG).

## 📁 بنية المشروع | Structure

```
fatin/
├── README.md                    ← هذا الملف
├── Fatin_Spec_AR_EN.md          ← وثيقة المعمارية والمواصفات الكاملة (ثنائية اللغة)
├── database/                    ← ملفات SQL (شغّلها بالترتيب في Supabase SQL Editor)
│   ├── 01_schema.sql            ← الجداول والأنواع والفهارس
│   ├── 02_rls_policies.sql      ← سياسات الأمان (RLS)
│   ├── 03_seed.sql              ← صلاحيات RBAC + بيانات تجريبية
│   ├── 04_saudi_grades.sql      ← الصفوف الدراسية السعودية
│   ├── 05_library_rag.sql       ← دعم البحث الدلالي (embeddings)
│   ├── 06_storage.sql           ← حاوية التخزين للملفات
│   ├── grade6_math_seed.sql     ← مثال: مادة رياضيات السادس
│   └── lesson_content_sample.sql← مثال: محتوى درس
├── edge-functions/
│   ├── editor-ready/            ← نسخ مستقلة جاهزة للّصق في Supabase (Via Editor)
│   │   ├── explain-lesson.ts
│   │   ├── generate-questions.ts
│   │   ├── analyze-student.ts
│   │   ├── ai-tutor-chat.ts
│   │   ├── extract-content.ts
│   │   └── split-textbook.ts
│   ├── _shared/openai.ts        ← أدوات مشتركة (نسخة CLI)
│   └── <function>/index.ts      ← نسخ CLI المنظّمة
└── web/
    ├── fatin-app-connected.html ← التطبيق الموصول بـ Supabase (الرئيسي)
    └── fatin-app.html           ← نموذج تجريبي بدون اتصال (للعرض)
```

## 🚀 التشغيل | Setup

1. **قاعدة البيانات**: في Supabase → SQL Editor، شغّل ملفات `database/` بالترتيب (01 → 06).
2. **الدوال**: انشر ملفات `edge-functions/editor-ready/` في Supabase Edge Functions (Via Editor).
3. **الأسرار (Secrets)**: أضف `OPENAI_API_KEY` في Edge Functions → Secrets.
   - اختياري: `AI_MODEL` (افتراضي `gpt-4o`)، `AI_EMBED_MODEL` (افتراضي `text-embedding-3-small`).
4. **التطبيق**: في `web/fatin-app-connected.html` عدّل `SUPABASE_URL` و `SUPABASE_ANON_KEY`، ثم افتحه في المتصفح.

تفاصيل أكثر في `Fatin_Spec_AR_EN.md`.

## 🔒 ملاحظة أمنية | Security Note

- مفتاح `anon public` في ملف الويب **عام وآمن** للنشر (RLS يحمي البيانات).
- مفتاح `service_role` و `OPENAI_API_KEY` **سرّيان** — مكانهما فقط Supabase Secrets، ولا يوجدان في أي ملف هنا.
- إن أردت خصوصية أعلى، اجعل المستودع **Private**.

## 📄 الترخيص | License

اختر ترخيصاً يناسبك (مثل MIT). محتوى المناهج الرسمي مملوك لوزارة التعليم/المركز الوطني للمناهج ويتطلب إذناً للاستخدام.
