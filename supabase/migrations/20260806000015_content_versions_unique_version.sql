-- ============================================================
-- P3-AI-021: Add UNIQUE constraint on content_versions version_number
-- Prevents duplicate version numbers from concurrent inserts.
-- ============================================================

-- Drop plain index first (UNIQUE constraint creates its own index)
drop index if exists idx_content_versions_project;

-- Add UNIQUE constraint — serves as both uniqueness enforcement
-- and the index for ORDER BY version_number DESC queries
alter table public.content_versions
  add constraint uq_content_versions_project_version
  unique (content_project_id, version_number);
