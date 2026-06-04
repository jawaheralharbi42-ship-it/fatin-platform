-- ============================================================================
-- منصة فطن | Fatin  —  02_rls_policies.sql
-- Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------
-- Strategy:
--   * Every row is scoped to org_id (tenant isolation).
--   * Helper functions read the caller's account row to resolve org & role.
--   * super_admin/supervisor: org-wide access. teacher: their courses/students.
--     parent: only linked children. student: only own rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER FUNCTIONS (SECURITY DEFINER) — avoid recursive RLS lookups
-- ----------------------------------------------------------------------------
create or replace function auth_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from accounts where id = auth.uid();
$$;

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from accounts where id = auth.uid();
$$;

-- student.id for the currently logged-in student
create or replace function auth_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from students s where s.account_id = auth.uid();
$$;

-- returns true if the caller (parent) is linked to the given student
create or replace function is_parent_of(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from parents p
    join parent_student_links l on l.parent_id = p.id
    where p.account_id = auth.uid() and l.student_id = p_student
  );
$$;

-- staff = super_admin or supervisor or teacher (same org)
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('super_admin','supervisor','teacher');
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('super_admin','supervisor');
$$;

-- ----------------------------------------------------------------------------
-- ENABLE RLS on all tenant tables
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'organizations','accounts','students','parents','parent_student_links',
    'teachers','supervisors','courses','units','lessons','lesson_contents',
    'questions','assessments','assessment_questions','attempts','answers',
    'results','home_tasks','student_progress','attendance','study_sessions',
    'ai_analysis','ai_recommendations','ai_chat_messages','notifications',
    'reports','audit_logs'])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS — members can read their own org; only super_admin writes
-- ----------------------------------------------------------------------------
create policy org_read on organizations
  for select using (id = auth_org_id());
create policy org_write on organizations
  for all using (id = auth_org_id() and auth_role() = 'super_admin')
  with check (id = auth_org_id() and auth_role() = 'super_admin');

-- ----------------------------------------------------------------------------
-- ACCOUNTS
--   read: self always; staff read same-org; parent reads linked children accounts
--   write: admins manage org accounts; users update their own profile
-- ----------------------------------------------------------------------------
create policy acc_read_self on accounts
  for select using (id = auth.uid());
create policy acc_read_staff on accounts
  for select using (org_id = auth_org_id() and is_staff());
create policy acc_update_self on accounts
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy acc_admin_all on accounts
  for all using (org_id = auth_org_id() and is_admin())
  with check (org_id = auth_org_id() and is_admin());

-- ----------------------------------------------------------------------------
-- STUDENTS
-- ----------------------------------------------------------------------------
create policy stu_self_read on students
  for select using (account_id = auth.uid());
create policy stu_parent_read on students
  for select using (is_parent_of(id));
create policy stu_staff_read on students
  for select using (org_id = auth_org_id() and is_staff());
create policy stu_admin_write on students
  for all using (org_id = auth_org_id() and is_admin())
  with check (org_id = auth_org_id() and is_admin());

-- ----------------------------------------------------------------------------
-- PARENTS & LINKS
-- ----------------------------------------------------------------------------
create policy par_self_read on parents
  for select using (account_id = auth.uid());
create policy par_staff_read on parents
  for select using (org_id = auth_org_id() and is_staff());
create policy par_admin_write on parents
  for all using (org_id = auth_org_id() and is_admin())
  with check (org_id = auth_org_id() and is_admin());

create policy psl_parent_read on parent_student_links
  for select using (
    exists (select 1 from parents p where p.id = parent_id and p.account_id = auth.uid())
  );
create policy psl_staff_all on parent_student_links
  for all using (
    exists (select 1 from students s where s.id = student_id and s.org_id = auth_org_id() and is_admin())
  ) with check (
    exists (select 1 from students s where s.id = student_id and s.org_id = auth_org_id() and is_admin())
  );

-- ----------------------------------------------------------------------------
-- TEACHERS / SUPERVISORS
-- ----------------------------------------------------------------------------
create policy tch_read on teachers
  for select using (org_id = auth_org_id());
create policy tch_admin_write on teachers
  for all using (org_id = auth_org_id() and is_admin())
  with check (org_id = auth_org_id() and is_admin());

create policy sup_read on supervisors
  for select using (org_id = auth_org_id());
create policy sup_admin_write on supervisors
  for all using (org_id = auth_org_id() and auth_role() = 'super_admin')
  with check (org_id = auth_org_id() and auth_role() = 'super_admin');

-- ----------------------------------------------------------------------------
-- COURSES / UNITS / LESSONS / CONTENT
--   read: any org member can read published; staff read all
--   write: staff (teacher/admin)
-- ----------------------------------------------------------------------------
create policy course_read on courses
  for select using (org_id = auth_org_id() and (is_published or is_staff()));
create policy course_staff_write on courses
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy unit_read on units
  for select using (org_id = auth_org_id());
create policy unit_staff_write on units
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy lesson_read on lessons
  for select using (org_id = auth_org_id() and (is_published or is_staff()));
create policy lesson_staff_write on lessons
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy lcontent_read on lesson_contents
  for select using (org_id = auth_org_id());
create policy lcontent_staff_write on lesson_contents
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

-- ----------------------------------------------------------------------------
-- QUESTION BANK & ASSESSMENTS
-- ----------------------------------------------------------------------------
create policy q_read on questions
  for select using (org_id = auth_org_id());
create policy q_staff_write on questions
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy assess_read on assessments
  for select using (org_id = auth_org_id() and (is_published or is_staff()));
create policy assess_staff_write on assessments
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy aq_read on assessment_questions
  for select using (
    exists (select 1 from assessments a where a.id = assessment_id and a.org_id = auth_org_id())
  );
create policy aq_staff_write on assessment_questions
  for all using (
    exists (select 1 from assessments a where a.id = assessment_id and a.org_id = auth_org_id() and is_staff())
  ) with check (
    exists (select 1 from assessments a where a.id = assessment_id and a.org_id = auth_org_id() and is_staff())
  );

-- ----------------------------------------------------------------------------
-- ATTEMPTS / ANSWERS / RESULTS
--   student: own rows. parent: read children. staff: org-wide.
-- ----------------------------------------------------------------------------
create policy att_student on attempts
  for all using (student_id = auth_student_id())
  with check (student_id = auth_student_id());
create policy att_parent_read on attempts
  for select using (is_parent_of(student_id));
create policy att_staff_read on attempts
  for select using (org_id = auth_org_id() and is_staff());
create policy att_staff_grade on attempts
  for update using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy ans_student on answers
  for all using (student_id = auth_student_id())
  with check (student_id = auth_student_id());
create policy ans_parent_read on answers
  for select using (is_parent_of(student_id));
create policy ans_staff on answers
  for all using (
    exists (select 1 from attempts a where a.id = attempt_id and a.org_id = auth_org_id() and is_staff())
  ) with check (
    exists (select 1 from attempts a where a.id = attempt_id and a.org_id = auth_org_id() and is_staff())
  );

create policy res_student on results
  for select using (student_id = auth_student_id());
create policy res_parent on results
  for select using (is_parent_of(student_id));
create policy res_staff on results
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

-- ----------------------------------------------------------------------------
-- HOME TASKS — parent/teacher create for a student; student reads own
-- ----------------------------------------------------------------------------
create policy ht_student_read on home_tasks
  for select using (student_id = auth_student_id());
create policy ht_student_update on home_tasks
  for update using (student_id = auth_student_id())
  with check (student_id = auth_student_id());           -- mark done
create policy ht_parent on home_tasks
  for all using (is_parent_of(student_id))
  with check (is_parent_of(student_id));
create policy ht_staff on home_tasks
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

-- ----------------------------------------------------------------------------
-- PROGRESS / ATTENDANCE / SESSIONS
-- ----------------------------------------------------------------------------
create policy prog_student on student_progress
  for all using (student_id = auth_student_id())
  with check (student_id = auth_student_id());
create policy prog_parent_read on student_progress
  for select using (is_parent_of(student_id));
create policy prog_staff on student_progress
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy attend_student_read on attendance
  for select using (student_id = auth_student_id());
create policy attend_parent_read on attendance
  for select using (is_parent_of(student_id));
create policy attend_staff on attendance
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

create policy sess_student on study_sessions
  for all using (student_id = auth_student_id())
  with check (student_id = auth_student_id());
create policy sess_staff_read on study_sessions
  for select using (org_id = auth_org_id() and is_staff());

-- ----------------------------------------------------------------------------
-- AI ANALYSIS / RECOMMENDATIONS / CHAT
--   Inserted by Edge Functions (service_role bypasses RLS). Read scoped here.
-- ----------------------------------------------------------------------------
create policy aia_student on ai_analysis
  for select using (student_id = auth_student_id());
create policy aia_parent on ai_analysis
  for select using (is_parent_of(student_id));
create policy aia_staff on ai_analysis
  for select using (org_id = auth_org_id() and is_staff());

create policy air_student on ai_recommendations
  for select using (student_id = auth_student_id());
create policy air_parent on ai_recommendations
  for select using (is_parent_of(student_id));
create policy air_staff on ai_recommendations
  for select using (org_id = auth_org_id() and is_staff());

create policy aichat_student on ai_chat_messages
  for all using (student_id = auth_student_id())
  with check (student_id = auth_student_id());
create policy aichat_staff_read on ai_chat_messages
  for select using (org_id = auth_org_id() and is_admin());

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS — recipient reads/updates own; staff create
-- ----------------------------------------------------------------------------
create policy notif_recipient on notifications
  for select using (recipient_id = auth.uid());
create policy notif_recipient_update on notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
create policy notif_staff_insert on notifications
  for insert with check (org_id = auth_org_id() and is_staff());

-- ----------------------------------------------------------------------------
-- REPORTS
-- ----------------------------------------------------------------------------
create policy rep_student on reports
  for select using (student_id = auth_student_id());
create policy rep_parent on reports
  for select using (is_parent_of(student_id));
create policy rep_staff on reports
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());

-- ----------------------------------------------------------------------------
-- AUDIT LOGS — only admins read; inserts via service_role
-- ----------------------------------------------------------------------------
create policy audit_admin_read on audit_logs
  for select using (org_id = auth_org_id() and is_admin());
