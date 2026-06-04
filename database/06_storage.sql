-- ============================================================================
-- منصة فطن | Fatin — 06_storage.sql
-- إعداد مخزن المكتبة (Storage) لرفع ملفات الدروس (PDF/Word/PPT/صور) + سياساته.
-- الملفات تُخزَّن تحت مسار يبدأ بمعرّف المؤسسة:  {org_id}/{lesson_id}/{file}
-- Run after 01_schema.sql.
-- ============================================================================

-- 1) أنشئ حاوية التخزين "library" (خاصة، غير عامة)
insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do nothing;

-- 2) سياسات الوصول على ملفات الحاوية (storage.objects)
--    القاعدة: العضو يصل فقط لملفات مؤسسته (المجلد الأول = org_id)،
--    والكتابة للطاقم التعليمي فقط.

-- قراءة: أي عضو في نفس المؤسسة
drop policy if exists "library_org_read" on storage.objects;
create policy "library_org_read" on storage.objects
  for select using (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select org_id::text from accounts where id = auth.uid())
  );

-- رفع: الطاقم التعليمي (مدير/مشرف/معلم) في نفس المؤسسة
drop policy if exists "library_staff_insert" on storage.objects;
create policy "library_staff_insert" on storage.objects
  for insert with check (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select org_id::text from accounts where id = auth.uid())
    and (select role from accounts where id = auth.uid()) in ('super_admin','supervisor','teacher')
  );

-- تحديث/حذف: نفس شرط الطاقم
drop policy if exists "library_staff_update" on storage.objects;
create policy "library_staff_update" on storage.objects
  for update using (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select org_id::text from accounts where id = auth.uid())
    and (select role from accounts where id = auth.uid()) in ('super_admin','supervisor','teacher')
  );

drop policy if exists "library_staff_delete" on storage.objects;
create policy "library_staff_delete" on storage.objects
  for delete using (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select org_id::text from accounts where id = auth.uid())
    and (select role from accounts where id = auth.uid()) in ('super_admin','supervisor','teacher')
  );
