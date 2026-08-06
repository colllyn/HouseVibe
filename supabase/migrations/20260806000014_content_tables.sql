-- Migration: Content Tables Foundation — P3-AI-021 prereq
-- Creates content_projects, content_versions, publishing_records
-- Enums: content_platform, content_project_status, compliance_status
-- RLS: workspace_id isolation + content_factory feature check
-- Owner: ai-deepseek-engineer / data-security-engineer

begin;

-- =============================================================================
-- 1. Content Platform Enum
-- =============================================================================

create type public.content_platform as enum (
  'xiaohongshu',
  'douyin',
  'wechat_moments'
);

-- =============================================================================
-- 2. Content Project Status Enum
-- =============================================================================

create type public.content_project_status as enum (
  'draft',
  'ready',
  'published',
  'archived'
);

-- =============================================================================
-- 3. Compliance Status Enum
-- =============================================================================

create type public.compliance_status as enum (
  'clean',
  'review_required',
  'blocked'
);

-- =============================================================================
-- 4. content_projects Table
-- =============================================================================

create table public.content_projects (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  platform public.content_platform not null default 'xiaohongshu',
  target_audience text,
  content_angle text,
  content_goal text,
  tone text,
  video_duration_seconds integer,
  is_on_camera boolean default false,
  status public.content_project_status not null default 'draft',
  private_message_keyword text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.content_projects is 'Content creation projects. Each project targets one property on one platform. Requires content_factory feature.';
comment on column public.content_projects.private_message_keyword is 'Auto-generated DM keyword for lead tracking. Must not contain PII.';

-- Indexes
create index idx_content_projects_workspace on public.content_projects (workspace_id, platform, status) where deleted_at is null;
create index idx_content_projects_property on public.content_projects (property_id) where deleted_at is null;
create index idx_content_projects_created_by on public.content_projects (created_by) where deleted_at is null;

-- =============================================================================
-- 5. content_versions Table
-- =============================================================================

create table public.content_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_project_id uuid not null references public.content_projects(id) on delete cascade,
  version_number integer not null default 1,
  model_provider text not null default 'deepseek',
  model_name text not null,
  prompt_version text not null,
  input_snapshot jsonb not null,
  output_json jsonb not null,
  facts_used jsonb default '[]'::jsonb,
  missing_information jsonb default '[]'::jsonb,
  risk_flags jsonb default '[]'::jsonb,
  compliance_status public.compliance_status not null default 'clean',
  compliance_flags jsonb default '[]'::jsonb,
  feedback_score integer check (feedback_score in (-1, 0, 1)),
  feedback_type text,
  feedback_comment text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.content_versions is 'AI-generated content versions. Each version captures the full AI output and user edits.';
comment on column public.content_versions.input_snapshot is 'Sanitized input snapshot at generation time (no phone/wechat/address).';
comment on column public.content_versions.output_json is 'AI-generated full output (sanitized).';

-- Indexes
create index idx_content_versions_project on public.content_versions (content_project_id, version_number desc);
create index idx_content_versions_workspace on public.content_versions (workspace_id);

-- =============================================================================
-- 6. publishing_records Table
-- =============================================================================

create table public.publishing_records (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_project_id uuid not null references public.content_projects(id) on delete cascade,
  content_version_id uuid not null references public.content_versions(id) on delete cascade,
  platform text not null,
  published_at timestamptz not null,
  post_url text,
  content_code text,
  private_message_keyword text,
  views integer not null default 0,
  likes integer not null default 0,
  favorites integer not null default 0,
  comments integer not null default 0,
  direct_messages integer not null default 0,
  qualified_leads integer not null default 0,
  viewings integer not null default 0,
  deals integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.publishing_records is 'Post-publishing tracking. Records platform metrics and lead attribution.';

-- Indexes
create index idx_publishing_records_workspace on public.publishing_records (workspace_id, published_at desc);
create index idx_publishing_records_project on public.publishing_records (content_project_id);

-- =============================================================================
-- 7. RLS — Enable on all content tables
-- =============================================================================

alter table public.content_projects enable row level security;
alter table public.content_versions enable row level security;
alter table public.publishing_records enable row level security;

-- -------------------------------------------------------------------------
-- content_projects RLS
-- -------------------------------------------------------------------------

-- Read: workspace member + content_factory feature
create policy "cp_select: workspace + content_factory"
  on public.content_projects for select using (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
    and deleted_at is null
  );

-- Insert: workspace member + content_factory feature + created_by = self
create policy "cp_insert: workspace + content_factory"
  on public.content_projects for insert with check (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
    and created_by = (select auth.uid())
  );

-- Update: workspace member + content_factory feature (status changes, soft delete)
create policy "cp_update: workspace + content_factory"
  on public.content_projects for update using (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
    and deleted_at is null
  ) with check (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
    and deleted_at is null
  );

-- Delete: not allowed (soft-delete via update)
-- No DELETE policy — all deletions use deleted_at (soft delete)

-- -------------------------------------------------------------------------
-- content_versions RLS
-- -------------------------------------------------------------------------

-- Read: workspace member + content_factory feature
create policy "cv_select: workspace + content_factory"
  on public.content_versions for select using (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
  );

-- Insert: workspace member + content_factory + created_by = self
create policy "cv_insert: workspace + content_factory"
  on public.content_versions for insert with check (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
    and created_by = (select auth.uid())
  );

-- -------------------------------------------------------------------------
-- publishing_records RLS
-- -------------------------------------------------------------------------

-- Read: workspace member + content_factory
create policy "pr_select: workspace + content_factory"
  on public.publishing_records for select using (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
  );

-- Insert: workspace member + content_factory
create policy "pr_insert: workspace + content_factory"
  on public.publishing_records for insert with check (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
  );

-- Update: workspace member + content_factory
create policy "pr_update: workspace + content_factory"
  on public.publishing_records for update using (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
  ) with check (
    private.is_workspace_member(workspace_id)
    and private.has_feature('content_factory')
  );

-- =============================================================================
-- 8. Updated-at trigger for content_projects and publishing_records
-- =============================================================================

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_content_projects_updated_at
  before update on public.content_projects
  for each row execute function private.set_updated_at();

create trigger trg_publishing_records_updated_at
  before update on public.publishing_records
  for each row execute function private.set_updated_at();

-- =============================================================================
-- 9. Grant table access to authenticated
-- =============================================================================

grant select, insert, update on public.content_projects to authenticated;
grant select, insert on public.content_versions to authenticated;
grant select, insert, update on public.publishing_records to authenticated;

-- Revoke from public/anon
revoke all on public.content_projects from public, anon;
revoke all on public.content_versions from public, anon;
revoke all on public.publishing_records from public, anon;

commit;
