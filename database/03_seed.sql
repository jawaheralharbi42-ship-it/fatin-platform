-- ============================================================================
-- منصة فطن | Fatin  —  03_seed.sql
-- Demo seed data + RBAC permissions (run after schema & RLS).
-- NOTE: accounts.id must match auth.users ids. For local demo create the
--       auth users first via Supabase, then plug their UUIDs below.
-- ============================================================================

-- RBAC permission catalog
insert into permissions (key, description) values
  ('users.manage',       'Create/update/delete users'),
  ('content.manage',     'Create/edit courses, lessons, content'),
  ('content.publish',    'Publish content & assessments'),
  ('assessments.manage', 'Create/edit assessments & question bank'),
  ('grading.manage',     'Grade attempts'),
  ('reports.view',       'View analytics & reports'),
  ('reports.export',     'Export reports to PDF'),
  ('ai.use',             'Use AI generation features'),
  ('settings.manage',    'Manage organization settings')
on conflict (key) do nothing;

-- role -> permissions mapping
insert into role_permissions (role, permission_id)
select 'super_admin', id from permissions
on conflict do nothing;

insert into role_permissions (role, permission_id)
select 'supervisor', id from permissions
where key in ('content.manage','content.publish','assessments.manage',
              'grading.manage','reports.view','reports.export','ai.use')
on conflict do nothing;

insert into role_permissions (role, permission_id)
select 'teacher', id from permissions
where key in ('content.manage','content.publish','assessments.manage',
              'grading.manage','reports.view','ai.use')
on conflict do nothing;

insert into role_permissions (role, permission_id)
select 'parent', id from permissions where key in ('reports.view')
on conflict do nothing;

insert into role_permissions (role, permission_id)
select 'student', id from permissions where key in ('ai.use')
on conflict do nothing;

-- Demo organization
insert into organizations (id, name, name_en)
values ('00000000-0000-0000-0000-0000000000aa', 'مدرسة فطن النموذجية', 'Fatin Model School')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Demo course tree (valid hex UUIDs). In production these are generated.
-- ---------------------------------------------------------------------------
insert into courses (id, org_id, title, title_en, subject, stage, grade_level, is_published)
values ('00000000-0000-0000-0000-00000000c001',
        '00000000-0000-0000-0000-0000000000aa',
        'الرياضيات', 'Mathematics', 'math', 'intermediate', 7, true)
on conflict do nothing;

insert into units (id, course_id, org_id, title, position)
values ('00000000-0000-0000-0000-000000000d01',
        '00000000-0000-0000-0000-00000000c001',
        '00000000-0000-0000-0000-0000000000aa', 'الأعداد الصحيحة', 1)
on conflict do nothing;

insert into lessons (id, unit_id, course_id, org_id, title, position, is_published)
values ('00000000-0000-0000-0000-000000000e01',
        '00000000-0000-0000-0000-000000000d01',
        '00000000-0000-0000-0000-00000000c001',
        '00000000-0000-0000-0000-0000000000aa', 'جمع وطرح الأعداد الصحيحة', 1, true)
on conflict do nothing;

insert into questions (org_id, course_id, lesson_id, q_type, difficulty, stem, options, correct_answer, explanation, is_ai_generated)
values
('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000000e01',
 'mcq','easy','ما ناتج (-3) + (5) ؟',
 '[{"key":"a","text":"2"},{"key":"b","text":"-2"},{"key":"c","text":"8"},{"key":"d","text":"-8"}]'::jsonb,
 '"a"'::jsonb,'بما أن 5 أكبر من 3، الناتج موجب = 2.', true),
('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000000e01',
 'true_false','easy','حاصل طرح عددين صحيحين دائماً عدد صحيح.',
 null,'true'::jsonb,'مجموعة الأعداد الصحيحة مغلقة تحت عملية الطرح.', true);
