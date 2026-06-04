-- ============================================================================
-- منصة فطن التعليمية الذكية | Fatin Smart Learning Platform
-- 01_schema.sql  —  Core Database Schema (Supabase / PostgreSQL)
-- ============================================================================
-- Conventions:
--   * All tables in schema `public`.
--   * Primary keys: uuid default gen_random_uuid().
--   * Timestamps: created_at / updated_at with triggers.
--   * Soft delete via `deleted_at` where useful.
--   * Multi-tenant by `org_id` (school / center) for SaaS isolation.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";       -- pgvector for AI embeddings (semantic search / RAG)

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type user_role        as enum ('super_admin','supervisor','teacher','parent','student');
create type account_status   as enum ('active','inactive','suspended','pending');
create type grade_stage      as enum ('primary','intermediate','secondary');         -- ابتدائي / متوسط / ثانوي
create type content_type     as enum ('video','pdf','word','pptx','image','text','audio');
create type question_type    as enum ('mcq','true_false','essay','ordering','drag_drop','short_answer');
create type difficulty_level as enum ('easy','medium','hard');
create type assessment_type  as enum ('quiz','exam','homework','activity');
create type attempt_status   as enum ('in_progress','submitted','graded');
create type notification_channel as enum ('in_app','email','sms','push');
create type notification_type as enum ('level_drop','new_homework','new_test','task_due','recommendation','grade_published','general');
create type report_period     as enum ('daily','weekly','monthly','term');
create type ai_task_type      as enum ('explain','simplify','generate_examples','generate_questions','analyze_performance','recommend','remedial_plan','content_to_lesson','chat_solve');

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS (Tenants) — مدرسة / مركز تعليمي
-- ----------------------------------------------------------------------------
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_en       text,
  logo_url      text,
  timezone      text not null default 'Asia/Riyadh',
  locale        text not null default 'ar',
  settings      jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ACCOUNTS — مرتبط بـ auth.users في Supabase
-- ----------------------------------------------------------------------------
create table accounts (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  role          user_role not null,
  full_name     text not null,
  national_id   text,                                   -- رقم الهوية
  phone         text,
  email         text,
  avatar_url    text,
  status        account_status not null default 'active',
  locale        text not null default 'ar',
  last_login_at timestamptz,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, national_id),
  unique (org_id, phone)
);
create index idx_accounts_org on accounts(org_id);
create index idx_accounts_role on accounts(org_id, role);

-- ----------------------------------------------------------------------------
-- STUDENTS — الطلاب
-- ----------------------------------------------------------------------------
create table students (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  stage         grade_stage not null,
  grade_level   int not null check (grade_level between 1 and 12),     -- الصف
  section       text,                                                  -- الفصل/الشعبة
  enrollment_no text,
  date_of_birth date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id)
);
create index idx_students_org on students(org_id);
create index idx_students_grade on students(org_id, stage, grade_level);

-- ----------------------------------------------------------------------------
-- PARENTS — أولياء الأمور
-- ----------------------------------------------------------------------------
create table parents (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  relation      text default 'guardian',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id)
);

-- جدول الربط متعدد لمتعدد بين أولياء الأمور والطلاب
create table parent_student_links (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references parents(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  relation      text default 'guardian',         -- أب / أم / وصي
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (parent_id, student_id)
);
create index idx_psl_parent on parent_student_links(parent_id);
create index idx_psl_student on parent_student_links(student_id);

-- ----------------------------------------------------------------------------
-- TEACHERS & SUPERVISORS — المعلمون والمشرفون
-- ----------------------------------------------------------------------------
create table teachers (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  specialization text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id)
);

create table supervisors (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id)
);

-- ----------------------------------------------------------------------------
-- COURSES / UNITS / LESSONS — المواد، الوحدات، الدروس
-- ----------------------------------------------------------------------------
create table courses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  title         text not null,
  title_en      text,
  subject       text not null,                  -- رياضيات / علوم ...
  stage         grade_stage not null,
  grade_level   int not null check (grade_level between 1 and 12),
  cover_url     text,
  description   text,
  is_published  boolean not null default false,
  created_by    uuid references accounts(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_courses_org on courses(org_id, stage, grade_level);

create table units (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  title         text not null,
  title_en      text,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_units_course on units(course_id);

create table lessons (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references units(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  title         text not null,
  title_en      text,
  position      int not null default 0,
  duration_min  int,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_lessons_unit on lessons(unit_id);

-- محتوى الدرس (الأصل المرفوع + النسخ المولّدة بالذكاء الاصطناعي)
create table lesson_contents (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references lessons(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  kind          content_type not null,
  title         text,
  storage_path  text,                            -- Supabase Storage path
  url           text,
  body          text,                            -- نص الشرح / الملخص
  is_ai_generated boolean not null default false,
  ai_variant    text,                            -- explanation / summary / audio_script / simplified
  audio_url     text,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_lcontent_lesson on lesson_contents(lesson_id);

-- ----------------------------------------------------------------------------
-- QUESTION BANK — بنك الأسئلة
-- ----------------------------------------------------------------------------
create table questions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  course_id     uuid references courses(id) on delete set null,
  unit_id       uuid references units(id) on delete set null,
  lesson_id     uuid references lessons(id) on delete set null,
  q_type        question_type not null,
  difficulty    difficulty_level not null default 'medium',
  stem          text not null,                   -- نص السؤال
  options       jsonb,                           -- [{key,text,is_correct}] للاختيار من متعدد/الترتيب
  correct_answer jsonb,                          -- إجابة نموذجية
  explanation   text,                            -- شرح الحل
  tags          text[] default '{}',
  is_ai_generated boolean not null default false,
  embedding     vector(1536),                    -- للبحث الدلالي وتوليد أسئلة مشابهة
  created_by    uuid references accounts(id),
  created_at    timestamptz not null default now()
);
create index idx_questions_org on questions(org_id, course_id, difficulty);
create index idx_questions_lesson on questions(lesson_id);

-- ----------------------------------------------------------------------------
-- ASSESSMENTS — الاختبارات / الواجبات / الأنشطة
-- ----------------------------------------------------------------------------
create table assessments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  course_id     uuid references courses(id) on delete set null,
  lesson_id     uuid references lessons(id) on delete set null,
  a_type        assessment_type not null,
  title         text not null,
  title_en      text,
  instructions  text,
  total_marks   numeric default 0,
  pass_mark     numeric default 0,
  time_limit_min int,
  available_from timestamptz,
  due_at        timestamptz,
  is_ai_generated boolean not null default false,
  is_published  boolean not null default false,
  created_by    uuid references accounts(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_assessments_org on assessments(org_id, a_type);
create index idx_assessments_course on assessments(course_id);

-- أسئلة الاختبار (ربط ببنك الأسئلة + درجة لكل سؤال)
create table assessment_questions (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id   uuid not null references questions(id) on delete cascade,
  position      int not null default 0,
  marks         numeric not null default 1,
  unique (assessment_id, question_id)
);

-- محاولات الطلاب على الاختبارات
create table attempts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  status        attempt_status not null default 'in_progress',
  score         numeric,
  max_score     numeric,
  percentage    numeric,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  graded_at     timestamptz,
  duration_sec  int,
  attempt_no    int not null default 1,
  created_at    timestamptz not null default now()
);
create index idx_attempts_student on attempts(student_id, assessment_id);

-- إجابات الطلاب التفصيلية
create table answers (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references attempts(id) on delete cascade,
  question_id   uuid not null references questions(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  response      jsonb,                           -- إجابة الطالب
  is_correct    boolean,
  awarded_marks numeric default 0,
  time_spent_sec int,
  ai_feedback   text,                            -- تصحيح/ملاحظة AI للمقالي
  created_at    timestamptz not null default now()
);
create index idx_answers_attempt on answers(attempt_id);

-- نتائج مجمّعة (مرجع سريع للتقارير)
create table results (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  attempt_id    uuid references attempts(id) on delete set null,
  score         numeric,
  percentage    numeric,
  grade_label   text,                            -- ممتاز / جيد جدا ...
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_results_student on results(student_id);

-- ----------------------------------------------------------------------------
-- HOMEWORK / TASKS من ولي الأمر أو المعلم
-- ----------------------------------------------------------------------------
create table home_tasks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  created_by    uuid not null references accounts(id),
  creator_role  user_role not null,              -- parent / teacher
  title         text not null,
  description   text,
  questions     jsonb,                           -- أسئلة مضافة يدوياً
  attachment_url text,
  due_at        timestamptz,
  is_done       boolean not null default false,
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_htasks_student on home_tasks(student_id);

-- ----------------------------------------------------------------------------
-- STUDENT PROGRESS — تتبع التقدم
-- ----------------------------------------------------------------------------
create table student_progress (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  course_id     uuid references courses(id) on delete cascade,
  lesson_id     uuid references lessons(id) on delete cascade,
  status        text not null default 'not_started',  -- not_started/in_progress/completed
  completion_pct numeric not null default 0,
  mastery_pct   numeric,                          -- نسبة الإتقان
  time_spent_sec int not null default 0,
  last_activity_at timestamptz,
  updated_at    timestamptz not null default now(),
  unique (student_id, lesson_id)
);
create index idx_progress_student on student_progress(student_id, course_id);

-- حضور الطالب
create table attendance (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  date          date not null,
  status        text not null default 'present',  -- present/absent/late/excused
  created_at    timestamptz not null default now(),
  unique (student_id, date)
);

-- جلسات تعليمية (لقياس الجلسات اليومية في الـ Dashboard)
create table study_sessions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  lesson_id     uuid references lessons(id) on delete set null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_sec  int,
  created_at    timestamptz not null default now()
);
create index idx_sessions_org_day on study_sessions(org_id, started_at);

-- ----------------------------------------------------------------------------
-- AI ANALYSIS & RECOMMENDATIONS — تحليلات وتوصيات الذكاء الاصطناعي
-- ----------------------------------------------------------------------------
create table ai_analysis (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  course_id     uuid references courses(id) on delete set null,
  mastery_pct   numeric,                          -- نسبة الإتقان
  understanding_level text,                       -- مستوى الفهم
  strengths     jsonb,                            -- نقاط القوة
  weaknesses    jsonb,                            -- نقاط الضعف
  missing_skills jsonb,                           -- المهارات الناقصة
  reasons       text,                             -- أسباب التأخر
  summary       text,                             -- ملخص التحليل
  model         text default 'gpt-4o',
  created_at    timestamptz not null default now()
);
create index idx_aianalysis_student on ai_analysis(student_id, created_at desc);

create table ai_recommendations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  analysis_id   uuid references ai_analysis(id) on delete set null,
  course_id     uuid references courses(id) on delete set null,
  rec_type      text not null,                    -- extra_lessons/extra_exercises/assessment/remedial_plan
  title         text not null,
  payload       jsonb,                            -- روابط دروس مقترحة / تمارين / خطة
  priority      int not null default 1,
  is_done       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index idx_airec_student on ai_recommendations(student_id, is_done);

-- سجل محادثات المساعد الدراسي + استدعاءات AI (للتدقيق والتكلفة)
create table ai_chat_messages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid references students(id) on delete cascade,
  role          text not null,                    -- user / assistant / system
  content       text,
  attachment_url text,
  task_type     ai_task_type,
  tokens_in     int,
  tokens_out    int,
  model         text,
  created_at    timestamptz not null default now()
);
create index idx_aichat_student on ai_chat_messages(student_id, created_at);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS — الإشعارات
-- ----------------------------------------------------------------------------
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  recipient_id  uuid not null references accounts(id) on delete cascade,
  n_type        notification_type not null,
  channel       notification_channel not null default 'in_app',
  title         text not null,
  body          text,
  data          jsonb,
  is_read       boolean not null default false,
  read_at       timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_notif_recipient on notifications(recipient_id, is_read);

-- ----------------------------------------------------------------------------
-- REPORTS — التقارير المولّدة
-- ----------------------------------------------------------------------------
create table reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  student_id    uuid references students(id) on delete cascade,
  scope         text not null,                    -- student/teacher/class/org
  period        report_period not null,
  period_start  date,
  period_end    date,
  payload       jsonb,                            -- مؤشرات + بيانات الرسوم
  file_url      text,                             -- PDF مُصدّر
  generated_by  uuid references accounts(id),
  created_at    timestamptz not null default now()
);
create index idx_reports_student on reports(student_id, period);

-- ----------------------------------------------------------------------------
-- RBAC — صلاحيات متقدمة (إضافة فوق user_role لمرونة أكبر)
-- ----------------------------------------------------------------------------
create table permissions (
  id    uuid primary key default gen_random_uuid(),
  key   text unique not null,                     -- e.g. 'users.manage','content.publish'
  description text
);

create table role_permissions (
  role          user_role not null,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role, permission_id)
);

-- ----------------------------------------------------------------------------
-- AUDIT LOG — سجل التدقيق وإدارة الجلسات
-- ----------------------------------------------------------------------------
create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organizations(id) on delete set null,
  actor_id      uuid references accounts(id) on delete set null,
  action        text not null,
  entity        text,
  entity_id     uuid,
  ip            inet,
  user_agent    text,
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index idx_audit_org on audit_logs(org_id, created_at desc);

-- ----------------------------------------------------------------------------
-- TRIGGERS — updated_at auto-update
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

do $$
declare t text;
begin
  for t in
    select unnest(array['organizations','accounts','students','parents','teachers',
                        'supervisors','courses','lessons','assessments','student_progress'])
  loop
    execute format(
      'create trigger trg_%s_updated before update on %I
       for each row execute function set_updated_at();', t, t);
  end loop;
end $$;
