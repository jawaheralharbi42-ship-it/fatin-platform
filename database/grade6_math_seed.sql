-- ============================================================================
-- منصة فطن | Fatin — grade6_math_seed.sql
-- تعبئة المكتبة بمادة: الرياضيات — الصف السادس الابتدائي (الجزء الثاني)
-- مستخرجة من فهرس الكتاب المدرسي الرسمي (٥ فصول ودروسها).
-- شغّله مرة واحدة في SQL Editor. ينشئ المادة والوحدات والدروس مباشرة.
-- (لا يحتاج نشر دوال ولا مفتاح OpenAI — هذا هو ناتج التقسيم جاهزاً)
-- ============================================================================
do $$
declare
  v_org    uuid;
  v_course uuid;
  v_unit   uuid;
begin
  -- استخدم مؤسسة أول حساب مدير، وإلا المؤسسة التجريبية
  select org_id into v_org from accounts where role = 'super_admin' order by created_at limit 1;
  if v_org is null then v_org := '00000000-0000-0000-0000-0000000000aa'; end if;

  -- المادة
  insert into courses (org_id, title, title_en, subject, stage, grade_level, is_published)
  values (v_org, 'الرياضيات — السادس الابتدائي (الجزء الثاني)', 'Mathematics - Grade 6 (Part 2)',
          'رياضيات', 'primary', 6, true)
  returning id into v_course;

  -- ===== الفصل 6: العمليات على الكسور الاعتيادية =====
  insert into units (org_id, course_id, title, position)
  values (v_org, v_course, 'الفصل 6: العمليات على الكسور الاعتيادية', 1) returning id into v_unit;
  insert into lessons (org_id, unit_id, course_id, title, position, is_published) values
    (v_org, v_unit, v_course, 'التهيئة', 1, true),
    (v_org, v_unit, v_course, '1-6 تقريب الكسور والأعداد الكسرية', 2, true),
    (v_org, v_unit, v_course, '2-6 خطة حل المسألة: تمثيل المسألة', 3, true),
    (v_org, v_unit, v_course, '3-6 جمع الكسور المتشابهة وطرحها', 4, true),
    (v_org, v_unit, v_course, '4-6 جمع الكسور غير المتشابهة وطرحها', 5, true),
    (v_org, v_unit, v_course, '5-6 جمع الأعداد الكسرية وطرحها', 6, true),
    (v_org, v_unit, v_course, '6-6 تقدير نواتج ضرب الكسور', 7, true),
    (v_org, v_unit, v_course, '7-6 ضرب الكسور', 8, true),
    (v_org, v_unit, v_course, '8-6 ضرب الأعداد الكسرية', 9, true),
    (v_org, v_unit, v_course, '9-6 قسمة الكسور', 10, true),
    (v_org, v_unit, v_course, '10-6 قسمة الأعداد الكسرية', 11, true);

  -- ===== الفصل 7: النسبة والتناسب =====
  insert into units (org_id, course_id, title, position)
  values (v_org, v_course, 'الفصل 7: النسبة والتناسب', 2) returning id into v_unit;
  insert into lessons (org_id, unit_id, course_id, title, position, is_published) values
    (v_org, v_unit, v_course, 'التهيئة', 1, true),
    (v_org, v_unit, v_course, '1-7 النسبة والمعدل', 2, true),
    (v_org, v_unit, v_course, '2-7 جداول النسب', 3, true),
    (v_org, v_unit, v_course, '3-7 التناسب', 4, true),
    (v_org, v_unit, v_course, '4-7 الجبر: حل التناسب', 5, true),
    (v_org, v_unit, v_course, '5-7 خطة حل المسألة: البحث عن نمط', 6, true);

  -- ===== الفصل 8: النسبة المئوية والاحتمالات =====
  insert into units (org_id, course_id, title, position)
  values (v_org, v_course, 'الفصل 8: النسبة المئوية والاحتمالات', 3) returning id into v_unit;
  insert into lessons (org_id, unit_id, course_id, title, position, is_published) values
    (v_org, v_unit, v_course, 'التهيئة', 1, true),
    (v_org, v_unit, v_course, '1-8 النسب المئوية والكسور الاعتيادية', 2, true),
    (v_org, v_unit, v_course, '2-8 النسب المئوية والكسور العشرية', 3, true),
    (v_org, v_unit, v_course, '3-8 الاحتمال', 4, true),
    (v_org, v_unit, v_course, '4-8 فضاء العينة', 5, true),
    (v_org, v_unit, v_course, '5-8 خطة حل المسألة: حل مسألة أبسط', 6, true);

  -- ===== الفصل 9: الهندسة: الزوايا والمضلعات =====
  insert into units (org_id, course_id, title, position)
  values (v_org, v_course, 'الفصل 9: الهندسة: الزوايا والمضلعات', 4) returning id into v_unit;
  insert into lessons (org_id, unit_id, course_id, title, position, is_published) values
    (v_org, v_unit, v_course, 'التهيئة', 1, true),
    (v_org, v_unit, v_course, '1-9 قياس وتقدير الزوايا ورسمها', 2, true),
    (v_org, v_unit, v_course, '2-9 العلاقات بين الزوايا', 3, true),
    (v_org, v_unit, v_course, '3-9 المثلثات', 4, true),
    (v_org, v_unit, v_course, '4-9 الأشكال الرباعية', 5, true),
    (v_org, v_unit, v_course, '5-9 خطة حل المسألة: الرسم', 6, true);

  -- ===== الفصل 10: القياس: المحيط والمساحة والحجم =====
  insert into units (org_id, course_id, title, position)
  values (v_org, v_course, 'الفصل 10: القياس: المحيط والمساحة والحجم', 5) returning id into v_unit;
  insert into lessons (org_id, unit_id, course_id, title, position, is_published) values
    (v_org, v_unit, v_course, 'التهيئة', 1, true),
    (v_org, v_unit, v_course, '1-10 محيط الدائرة', 2, true),
    (v_org, v_unit, v_course, '2-10 مساحة متوازي الأضلاع', 3, true),
    (v_org, v_unit, v_course, '3-10 مساحة المثلث', 4, true),
    (v_org, v_unit, v_course, '4-10 خطة حل المسألة: إنشاء نموذج', 5, true),
    (v_org, v_unit, v_course, '5-10 حجم المنشور الرباعي', 6, true),
    (v_org, v_unit, v_course, '6-10 مساحة سطح المنشور الرباعي', 7, true);

  raise notice 'تم إنشاء مادة الرياضيات (السادس) مع 5 وحدات و 35 درساً.';
end $$;
