# منصة فطن التعليمية الذكية — وثيقة المعمارية والمواصفات الكاملة
# Fatin Smart Learning Platform — Full Architecture & Specification

> ثنائية اللغة (عربي + إنجليزي) · إصدار 1.0 · يونيو 2026
> Bilingual (AR + EN) · v1.0 · June 2026

نبني هنا منصة SaaS تعليمية متعددة المستأجرين (Multi-tenant) للمدارس والمراكز التعليمية، تعمل بالعربية بالكامل (RTL) مع جاهزية للإنجليزية، ويقودها الذكاء الاصطناعي في الشرح والتقييم والتحليل والتوصيات.

This document specifies a multi-tenant educational SaaS for schools and learning centers, Arabic-first (RTL) with English-ready i18n, with AI driving explanation, assessment, analysis, and recommendations.

---

## 1. المعمارية العامة | System Architecture

### 1.1 نظرة عامة | Overview

```
┌──────────────────────────── العملاء | Clients ────────────────────────────┐
│  Web App (React + Vite, RTL)      Mobile (React Native / Expo) — لاحقاً     │
└───────────────┬───────────────────────────────────┬───────────────────────┘
                │ HTTPS / JWT                        │
        ┌───────▼────────────────────────────────────▼─────────┐
        │              Supabase (Backend-as-a-Service)          │
        │  ┌───────────┐ ┌──────────────┐ ┌──────────────────┐  │
        │  │ Auth      │ │ Postgres + RLS│ │ Storage (ملفات)  │  │
        │  │ (OTP/JWT) │ │  + pgvector   │ │ فيديو/PDF/صور    │  │
        │  └───────────┘ └──────┬───────┘ └──────────────────┘  │
        │  ┌──────────────────────▼──────────────────────────┐  │
        │  │ Edge Functions (Deno) — AI Orchestration Layer   │  │
        │  └──────────────────────┬──────────────────────────┘  │
        └─────────────────────────┼─────────────────────────────┘
                                  │ HTTPS
                      ┌───────────▼───────────┐
                      │  OpenAI GPT-4o / 4o-mini │
                      │  + Whisper (صوت) + TTS   │
                      └───────────────────────┘
   خدمات مساندة | Side services: Realtime (إشعارات), Cron (تقارير), Email/SMS provider
```

### 1.2 المكونات | Components

| الطبقة Layer | التقنية Technology | الدور Role |
|---|---|---|
| الواجهة Frontend | React 18 + Vite + TypeScript + TailwindCSS (RTL) | واجهات المستخدم لكل الأدوار |
| إدارة الحالة State | TanStack Query + Zustand | جلب البيانات والتخزين المؤقت |
| الرسوم Charts | Recharts | لوحات المؤشرات |
| التدويل i18n | i18next (ar/en) | دعم لغتين مع RTL/LTR |
| الخلفية Backend | Supabase (Postgres 15) | قاعدة البيانات + المصادقة + التخزين |
| الأمان Security | Row Level Security + JWT + RBAC | عزل المستأجرين والصلاحيات |
| الذكاء AI | Edge Functions → OpenAI | الشرح/التوليد/التحليل/التوصيات |
| البحث الدلالي Search | pgvector (embeddings) | أسئلة مشابهة + RAG |
| الإشعارات Realtime | Supabase Realtime + FCM (جوال) | إشعارات فورية |
| الجوال Mobile | React Native (Expo) — مرحلة لاحقة | iOS + Android |

### 1.3 مبادئ معمارية | Architectural Principles
- **عزل المستأجر Tenant isolation:** كل صف مرتبط بـ `org_id` ومحمي بـ RLS.
- **AI على الخادم AI server-side only:** مفاتيح OpenAI لا تُكشف للعميل أبداً؛ كل النداءات عبر Edge Functions.
- **التخزين المؤقت للمخرجات Caching:** محتوى AI (شرح/أسئلة) يُخزَّن في `lesson_contents` لتقليل التكلفة.
- **قابلية التوسع Scalability:** قراءة مكثفة → فهارس + جداول نتائج مجمّعة (`results`, `student_progress`).
- **التدقيق Auditing:** `audit_logs` لكل عملية حساسة.

---

## 2. أنواع المستخدمين والصلاحيات | Roles & RBAC

| الدور Role | الوصف | أبرز الصلاحيات |
|---|---|---|
| مدير النظام `super_admin` | تحكم كامل بالمستأجر | إدارة المستخدمين، الإعدادات، كل التقارير |
| المشرف التعليمي `supervisor` | جودة ومتابعة | مراقبة المعلمين والمحتوى، التقارير، التصدير |
| المعلم `teacher` | تدريس وتقييم | إدارة الدروس والاختبارات وبنك الأسئلة والتصحيح |
| ولي الأمر `parent` | متابعة الأبناء | عرض الأداء/التقارير، إضافة مهام منزلية |
| الطالب `student` | تعلّم | المكتبة، الدروس، الاختبارات، المساعد الذكي |

نظام RBAC مزدوج: `user_role` (سريع للسياسات) + جدول `permissions`/`role_permissions` لمرونة دقيقة (مثل `content.publish`, `reports.export`). راجع `database/03_seed.sql`.

Dual RBAC: a coarse `user_role` for fast RLS + a fine-grained `permissions` catalog mapped via `role_permissions` for feature gating.

---

## 3. مخطط قاعدة البيانات | Database Schema

التنفيذ الكامل في `database/01_schema.sql`. الجداول الأساسية (يتطابق مع المطلوب accounts/students/parents/teachers/courses/lessons/lesson_contents/assignments/tests/questions/answers/results/student_progress/notifications/reports/ai_analysis/ai_recommendations):

Full DDL in `database/01_schema.sql`. Core entities and relationships:

```
organizations 1───* accounts ──┬─1:1─ students ──* student_progress
                               ├─1:1─ parents ──* parent_student_links *── students
                               ├─1:1─ teachers
                               └─1:1─ supervisors

courses 1──* units 1──* lessons 1──* lesson_contents (asset + AI variants)
courses/lessons ──* questions (بنك الأسئلة + embedding vector)
assessments 1──* assessment_questions *── questions     (tests/quiz/homework/activity)
assessments 1──* attempts 1──* answers ──> results
students ──* home_tasks (من ولي الأمر/المعلم)
students ──* ai_analysis 1──* ai_recommendations
students ──* ai_chat_messages   (المساعد الدراسي + تتبع التكلفة)
accounts ──* notifications      students ──* reports / attendance / study_sessions
```

ملاحظات تصميمية | Design notes:
- `assignments` و`tests` و`activities` موحّدة في جدول `assessments` عبر `a_type` (quiz/exam/homework/activity) لتقليل التكرار — مع `home_tasks` المنفصل للمهام التي ينشئها ولي الأمر.
- `questions.q_type` يدعم: `mcq, true_false, essay, ordering, drag_drop, short_answer`.
- `questions.embedding vector(1536)` لتوليد أسئلة مشابهة والبحث الدلالي (RAG).
- `study_sessions` تغذّي مؤشر «الجلسات اليومية» في لوحة المدير.

---

## 4. سياسات الأمان | RLS Policies

التنفيذ الكامل في `database/02_rls_policies.sql`. القاعدة الذهبية: كل صف يُقرأ/يُكتب فقط ضمن `org_id` الخاص بالمستخدم، ثم تضييق إضافي حسب الدور عبر دوال مساعدة `SECURITY DEFINER`:

Full policies in `database/02_rls_policies.sql`. Golden rule: every row scoped to the caller's `org_id`, then narrowed by role via `SECURITY DEFINER` helpers:

| الدالة Helper | الغرض |
|---|---|
| `auth_org_id()` | معرّف مؤسسة المستخدم الحالي |
| `auth_role()` | دور المستخدم |
| `auth_student_id()` | معرّف الطالب الحالي (إن كان طالباً) |
| `is_parent_of(student)` | هل المستخدم ولي أمر لهذا الطالب؟ |
| `is_staff()` / `is_admin()` | طاقم تعليمي / إداري |

أمثلة | Examples:
- الطالب يرى محاولاته فقط: `att_student USING (student_id = auth_student_id())`.
- ولي الأمر يقرأ أداء أبنائه فقط عبر `is_parent_of()`.
- مخرجات AI تُكتب من Edge Functions بمفتاح `service_role` (يتجاوز RLS)، وتُقرأ ضمن سياسات مقيّدة.

---

## 5. هيكل الـ API | API Structure

### 5.1 الوصول المباشر للبيانات | Direct data (Supabase Client + RLS)
معظم عمليات CRUD تتم مباشرة من العميل عبر مكتبة Supabase، محمية بـ RLS — لا حاجة لطبقة API وسيطة.
Most CRUD uses the Supabase JS client directly, secured by RLS — no middle API tier needed.

```ts
const { data } = await supabase.from('lessons')
  .select('*, lesson_contents(*)').eq('course_id', id);
```

### 5.2 نقاط نهاية الذكاء الاصطناعي | AI Endpoints (Edge Functions)

| المسار Endpoint | الطريقة | الوصف |
|---|---|---|
| `POST /functions/v1/explain-lesson` | شرح الدرس (نصي/مبسّط/صوتي/أمثلة/أسئلة) ويخزّن النتائج |
| `POST /functions/v1/generate-questions` | توليد أسئلة لبنك الأسئلة أو لاختبار (كل الأنواع/الصعوبات) |
| `POST /functions/v1/analyze-student` | تحليل الأداء + التوصيات + الخطة العلاجية + إشعار ولي الأمر |
| `POST /functions/v1/ai-tutor-chat` | المساعد الدراسي: حل سؤال/صورة/PDF + خطوات + أسئلة مشابهة |
| `POST /functions/v1/content-to-lesson` | تحويل ملف مرفوع (PDF/Word/PPT) إلى ملخص+شرح+أسئلة |
| `POST /functions/v1/grade-essay` | تصحيح المقالي وإعطاء درجة وملاحظة |
| `POST /functions/v1/generate-report` | توليد تقرير دوري (PDF) ومؤشرات |

نماذج كود ثلاث دوال أساسية متاحة في `edge-functions/`. النمط الموحّد: تحقّق صلاحية القارئ بعميل المستخدم (RLS) → نفّذ AI بعميل الخدمة → خزّن النتائج وسجّل التكلفة.

Three reference functions are implemented in `edge-functions/`. Pattern: verify read access with the user client (RLS) → run AI with the service client → persist results & log cost.

### 5.3 المصادقة | Authentication
- تسجيل بالبريد + كلمة مرور، أو بالجوال عبر OTP (Supabase Auth: `signInWithOtp`).
- استعادة كلمة المرور (`resetPasswordForEmail`).
- جلسات JWT مع تدوير الرموز (refresh) وإدارة جلسات متعددة الأجهزة.

---

## 6. تدفق المستخدم | User Flows

### 6.1 الطالب يفتح درساً | Student opens a lesson
```
تسجيل الدخول → المكتبة → مادة → وحدة → درس
   → استدعاء explain-lesson (أو جلب المخزّن مؤقتاً)
   → عرض تبويبات: شرح نصي | تبسيط | صوتي | أمثلة | أسئلة تدريبية | اختبار قصير
   → "أعد شرح النقاط الصعبة" → استدعاء AI جزئي
   → عند الانتهاء: تحديث student_progress + study_sessions
```

### 6.2 توليد اختبار ذكي | Teacher generates a smart test
```
المعلم → اختبار جديد → اختيار الدرس/الصعوبة/الأنواع/العدد
   → generate-questions → معاينة وتعديل → نشر
   → الطالب يحل → answers → تصحيح آلي (+grade-essay للمقالي) → results
```

### 6.3 دورة التحليل والتوصية | Analysis & recommendation loop
```
بعد كل محاولة/واجب → analyze-student
   → ai_analysis (إتقان، فهم، قوة/ضعف، مهارات ناقصة)
   → ai_recommendations (دروس/تمارين/اختبار تقويمي/خطة علاجية)
   → إذا الإتقان < 60% → notifications لولي الأمر
```

### 6.4 ولي الأمر | Parent
```
دخول → لوحة الأبناء → بطاقة طالب (مستوى/قوة/ضعف)
   → التقرير الذكي → الخطة العلاجية
   → إضافة مهمة منزلية (عنوان/أسئلة/ملف/موعد) → home_tasks → إشعار الطالب
```

---

## 7. سير عمل الذكاء الاصطناعي | AI Workflow

| المهمة Task | النموذج Model | المدخلات | المخرجات | التخزين |
|---|---|---|---|---|
| شرح الدرس | GPT-4o (JSON) | عنوان/مادة/صف الدرس | شرح/تبسيط/نص صوتي/أمثلة/أسئلة | `lesson_contents` |
| الشرح الصوتي | TTS | نص الشرح | ملف صوتي | Storage + `audio_url` |
| توليد الأسئلة | GPT-4o | درس/صعوبة/أنواع | أسئلة منظمة + embeddings | `questions` |
| المساعد الدراسي | GPT-4o (Vision) | نص/صورة/PDF | حل بالخطوات + أسئلة مشابهة | `ai_chat_messages` |
| تحليل الأداء | GPT-4o (JSON) | محاولات/إجابات/سرعة/تقدّم | إتقان/قوة/ضعف/أسباب | `ai_analysis` |
| التوصيات والخطة | GPT-4o | التحليل | توصيات + خطة علاجية | `ai_recommendations` |
| تحويل المحتوى | GPT-4o + استخراج | ملف مرفوع | ملخص/شرح/أسئلة/اختبار | `lesson_contents` |
| تصحيح المقالي | GPT-4o-mini | إجابة الطالب + النموذج | درجة + ملاحظة | `answers.ai_feedback` |

**ضوابط الجودة والأمان | Guardrails:**
- نبرة مناسبة للعمر (`toneForGrade`) حسب الصف.
- إخراج JSON منظَّم (`response_format`) لضمان قابلية التحليل.
- التخزين المؤقت لتفادي إعادة التوليد وتقليل التكلفة.
- تتبّع التوكنات (`tokens_in/out`) لكل نداء لمراقبة التكلفة.
- مراجعة بشرية اختيارية قبل النشر (workflow اعتماد للمشرف).

---

## 8. مؤشرات الأداء | KPIs

| المؤشر | المصدر | الصيغة |
|---|---|---|
| نسبة التحسّن | `ai_analysis` عبر الزمن | Δ(mastery_pct) |
| نسبة الإكمال | `student_progress` | متوسط `completion_pct` |
| نسبة الحضور | `attendance` | حاضر / إجمالي الأيام |
| معدل الاختبارات | `results` | متوسط `percentage` |
| نقاط القوة/الضعف | `ai_analysis` | قوائم مستخرجة |
| مؤشر الجاهزية الأكاديمية | مركّب | دالة(إتقان، إكمال، حضور، اتجاه) |

تُعرض هذه المؤشرات في لوحات المدير/المشرف/المعلم/ولي الأمر كرسوم بيانية فورية (Recharts).

---

## 9. واجهة المستخدم وتجربة الاستخدام | UI/UX

**نظام التصميم | Design system**
- اتجاه RTL كامل، خط Tajawal، تصميم Responsive (Sidebar ينطوي على الجوال).
- ألوان هادئة: أساسي تركوازي `#0e8f86`، ثانوي بنفسجي `#5b6ee1`، خلفية `#f5f7fa`، حالات (نجاح/تحذير/خطر) ناعمة.
- مكوّنات: بطاقات KPI، رسوم أعمدة/دونات، جداول، تبويبات الدروس، محادثة المساعد.

**الشاشات المنفّذة في النموذج التفاعلي | Implemented screens** (`web/fatin-app.html`):
1. تسجيل الدخول (بريد/جوال OTP + اختيار الدور).
2. لوحة مدير النظام (٨ مؤشرات + رسوم + جدول مستخدمين).
3. لوحة الطالب (المكتبة + المهام + بوابة المساعد).
4. شاشة الدرس + الذكاء الاصطناعي (٦ تبويبات + توصية ذكية + التقدم).
5. المساعد الدراسي الذكي (محادثة + رفع ملفات).
6. لوحة ولي الأمر (بطاقات الأبناء + التقرير الذكي + الإشعارات).
7. لوحة المعلم (أداء الطلاب + بنك الأسئلة).
8. لوحة المشرف (أداء المعلمين + جودة المحتوى).

يفتح النموذج في أي متصفح مباشرة (ملف HTML مستقل) ويمكن تبديل الأدوار من شاشة الدخول لاستعراض كل اللوحات.

---

## 10. تصميم الجوال | Mobile Design (المرحلة اللاحقة | Later phase)
- React Native (Expo) بمشاركة منطق الأعمال مع الويب عبر طبقة `@fatin/core`.
- ثلاثة تطبيقات بأدوار: الطالب / ولي الأمر / المعلم.
- إشعارات Push عبر FCM، تنزيل الدروس للعمل دون اتصال، الشرح الصوتي في الخلفية.
- نفس Supabase backend وEdge Functions — لا ازدواج في الخادم.

---

## 11. خطة التطوير على مراحل | Phased Roadmap

### المرحلة 0 — التأسيس | Foundation (أسبوعان)
إعداد Supabase، تنفيذ `01_schema` + `02_rls`، المصادقة (بريد/OTP)، نظام الأدوار، الهيكل الأساسي للويب RTL.

### المرحلة 1 — MVP (٤–٦ أسابيع)
- إدارة المستخدمين وربط ولي الأمر بالطالب.
- المكتبة: مواد/وحدات/دروس + رفع محتوى.
- `explain-lesson` (شرح/تبسيط/أمثلة) + عرض الدرس.
- اختبارات MCQ/صح-خطأ + التصحيح الآلي + `results`.
- لوحات أساسية: المدير، الطالب، ولي الأمر.
- إشعارات داخل التطبيق.

### المرحلة 2 — الذكاء الكامل | Full AI (٤–٦ أسابيع)
- المساعد الدراسي (نص/صورة/PDF) `ai-tutor-chat`.
- `analyze-student` + التوصيات + الخطة العلاجية + إشعار ولي الأمر.
- بنك الأسئلة + `generate-questions` + كل أنواع الأسئلة (مقالي/ترتيب/سحب وإفلات).
- تحويل المحتوى `content-to-lesson` + الشرح الصوتي (TTS).
- لوحتا المعلم والمشرف بالكامل + التقارير القابلة للتصدير (PDF).

### المرحلة 3 — التوسّع | Scale & Mobile (مستمر)
- تطبيق الجوال (iOS/Android).
- البحث الدلالي (pgvector/RAG) وأسئلة مشابهة.
- الإنجليزية الكاملة (i18n)، تحليلات متقدمة، تكامل أنظمة المدارس (SIS).

---

## 12. هيكل المشروع المُسلّم | Delivered Project Structure
```
fatin/
├── Fatin_Spec_AR_EN.md            ← هذه الوثيقة (المعمارية والمواصفات)
├── database/
│   ├── 01_schema.sql              ← كل الجداول والأنواع والفهارس والمشغّلات
│   ├── 02_rls_policies.sql        ← سياسات الأمان على مستوى الصف + الدوال المساعدة
│   └── 03_seed.sql                ← صلاحيات RBAC + بيانات تجريبية
├── edge-functions/
│   ├── _shared/openai.ts          ← أدوات مشتركة (عملاء Supabase + OpenAI)
│   ├── explain-lesson/index.ts    ← شرح الدرس بالذكاء الاصطناعي
│   ├── generate-questions/index.ts← توليد الأسئلة
│   ├── analyze-student/index.ts   ← تحليل الأداء + التوصيات
│   └── ai-tutor-chat/index.ts     ← المساعد الدراسي الذكي
└── web/
    └── fatin-app.html             ← نموذج ويب تفاعلي (كل اللوحات RTL) يعمل في المتصفح
```

### كيفية التشغيل | How to run
- **النموذج الويب:** افتح `web/fatin-app.html` في أي متصفح، اختر الدور من شاشة الدخول.
- **قاعدة البيانات:** أنشئ مشروع Supabase ثم شغّل ملفات `database/*.sql` بالترتيب في SQL Editor.
- **الدوال:** `supabase functions deploy explain-lesson` … مع ضبط أسرار `OPENAI_API_KEY` و`SUPABASE_SERVICE_ROLE_KEY`.

---

> هذه النسخة 1.0 تغطي المواصفات الكاملة لكل الميزات المطلوبة كنقطة انطلاق للتنفيذ. الخطوة التالية المقترحة: ربط النموذج بالـ Supabase الفعلي وتفعيل أول Edge Function (explain-lesson).
> v1.0 covers full specs for all requested features as an implementation starting point. Suggested next step: wire the prototype to a live Supabase project and ship the first Edge Function (explain-lesson).
