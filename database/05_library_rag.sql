-- ============================================================================
-- منصة فطن | Fatin — 05_library_rag.sql
-- دعم المكتبة الداخلية + البحث الدلالي (RAG) ليشرح الذكاء الاصطناعي
-- ويولّد الأسئلة من المحتوى المرفوع نفسه (PDF/Word/PPT/نص).
-- Internal library + semantic retrieval so AI grounds explanations &
-- questions ONLY on the uploaded material. Run after 01_schema.sql.
-- ============================================================================

create extension if not exists "vector";

-- ----------------------------------------------------------------------------
-- مقاطع المحتوى المُستخرجة من الملفات المرفوعة، مع متجه دلالي لكل مقطع
-- Extracted text chunks from each uploaded asset, each with an embedding.
-- ----------------------------------------------------------------------------
create table if not exists content_chunks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  lesson_id     uuid not null references lessons(id) on delete cascade,
  content_id    uuid references lesson_contents(id) on delete cascade,
  chunk_index   int not null default 0,
  text          text not null,                       -- نص المقطع المستخرج
  token_count   int,
  embedding     vector(1536),                         -- text-embedding-3-small
  created_at    timestamptz not null default now()
);
create index if not exists idx_chunks_lesson on content_chunks(lesson_id);
-- فهرس تقريبي سريع للبحث الدلالي (cosine)
create index if not exists idx_chunks_embedding
  on content_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- حالة المعالجة على المحتوى المرفوع (هل اُستخرج وفُهرس؟)
alter table lesson_contents
  add column if not exists extraction_status text not null default 'pending'; -- pending/processing/done/error
alter table lesson_contents
  add column if not exists extracted_chars int;

-- ----------------------------------------------------------------------------
-- دالة بحث دلالي: ترجع أقرب المقاطع لسؤال/موضوع داخل درس معيّن
-- Semantic search: top-k chunks most relevant to a query embedding,
-- optionally scoped to one lesson (RAG retrieval step).
-- ----------------------------------------------------------------------------
create or replace function match_content_chunks(
  query_embedding vector(1536),
  p_lesson_id     uuid default null,
  p_org_id        uuid default null,
  match_count     int default 6
)
returns table (
  id uuid, lesson_id uuid, text text, similarity float
)
language sql stable as $$
  select c.id, c.lesson_id, c.text,
         1 - (c.embedding <=> query_embedding) as similarity
  from content_chunks c
  where (p_lesson_id is null or c.lesson_id = p_lesson_id)
    and (p_org_id   is null or c.org_id   = p_org_id)
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ----------------------------------------------------------------------------
-- RLS: نفس منطق المكتبة — أعضاء المؤسسة يقرؤون، والطاقم يكتب.
-- ----------------------------------------------------------------------------
alter table content_chunks enable row level security;
alter table content_chunks force row level security;

create policy chunks_read on content_chunks
  for select using (org_id = auth_org_id());
create policy chunks_staff_write on content_chunks
  for all using (org_id = auth_org_id() and is_staff())
  with check (org_id = auth_org_id() and is_staff());
