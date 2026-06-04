-- ============================================================================
-- منصة فطن | Fatin — 04_saudi_grades.sql
-- ضبط الصفوف الدراسية السعودية + منع الأخطاء في الربط بين المرحلة والصف
-- Saudi grade catalog + enforce correct stage<->grade mapping.
-- شغّل هذا الملف بعد 01_schema.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- جدول مرجعي للصفوف السعودية (أسماء عربية رسمية)
-- Reference table of Saudi grades with official Arabic labels.
-- ----------------------------------------------------------------------------
create table if not exists saudi_grades (
  grade_level int primary key check (grade_level between 1 and 12),
  stage       grade_stage not null,
  name_ar     text not null,
  name_en     text not null,
  stage_year  int not null            -- ترتيب السنة داخل المرحلة (1..6 / 1..3)
);

insert into saudi_grades (grade_level, stage, name_ar, name_en, stage_year) values
  (1,'primary','الصف الأول الابتدائي','Grade 1 (Primary)',1),
  (2,'primary','الصف الثاني الابتدائي','Grade 2 (Primary)',2),
  (3,'primary','الصف الثالث الابتدائي','Grade 3 (Primary)',3),
  (4,'primary','الصف الرابع الابتدائي','Grade 4 (Primary)',4),
  (5,'primary','الصف الخامس الابتدائي','Grade 5 (Primary)',5),
  (6,'primary','الصف السادس الابتدائي','Grade 6 (Primary)',6),
  (7,'intermediate','الصف الأول المتوسط','Grade 7 (Intermediate)',1),
  (8,'intermediate','الصف الثاني المتوسط','Grade 8 (Intermediate)',2),
  (9,'intermediate','الصف الثالث المتوسط','Grade 9 (Intermediate)',3),
  (10,'secondary','الصف الأول الثانوي','Grade 10 (Secondary)',1),
  (11,'secondary','الصف الثاني الثانوي','Grade 11 (Secondary)',2),
  (12,'secondary','الصف الثالث الثانوي','Grade 12 (Secondary)',3)
on conflict (grade_level) do update
  set stage = excluded.stage, name_ar = excluded.name_ar,
      name_en = excluded.name_en, stage_year = excluded.stage_year;

-- ----------------------------------------------------------------------------
-- دالة تتحقق أن الصف يطابق المرحلة الصحيحة (ابتدائي 1-6 / متوسط 7-9 / ثانوي 10-12)
-- Validates that (stage, grade_level) is a legal Saudi combination.
-- ----------------------------------------------------------------------------
create or replace function valid_stage_grade(p_stage grade_stage, p_grade int)
returns boolean language sql immutable as $$
  select exists (
    select 1 from saudi_grades
    where grade_level = p_grade and stage = p_stage
  );
$$;

-- ----------------------------------------------------------------------------
-- قيود تمنع إدخال صف لا يطابق مرحلته في الطلاب والمواد
-- CHECK constraints so wrong combinations are rejected at insert/update.
-- (نستخدم NOT VALID ثم VALIDATE حتى لا تفشل لو وُجدت بيانات قديمة)
-- ----------------------------------------------------------------------------
alter table students
  drop constraint if exists chk_students_stage_grade;
alter table students
  add constraint chk_students_stage_grade
  check (valid_stage_grade(stage, grade_level)) not valid;

alter table courses
  drop constraint if exists chk_courses_stage_grade;
alter table courses
  add constraint chk_courses_stage_grade
  check (valid_stage_grade(stage, grade_level)) not valid;

-- فعّل القيود (شغّلها بعد التأكد أن البيانات الحالية سليمة)
-- alter table students validate constraint chk_students_stage_grade;
-- alter table courses  validate constraint chk_courses_stage_grade;

-- ----------------------------------------------------------------------------
-- عرض مساعد: المادة مع اسم الصف العربي الجاهز للعرض في الواجهة
-- Helper view: course with ready Arabic grade label for the UI.
-- ----------------------------------------------------------------------------
create or replace view v_courses_labeled as
select c.*, g.name_ar as grade_name_ar, g.name_en as grade_name_en, g.stage_year
from courses c
join saudi_grades g on g.grade_level = c.grade_level;

-- جعل الجدول المرجعي قابلاً للقراءة من الجميع داخل المؤسسة (ثابت غير حساس)
alter table saudi_grades enable row level security;
create policy saudi_grades_read on saudi_grades for select using (true);
