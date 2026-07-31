-- Migration: Workspaces and Workspace Members
-- Creates workspaces table, workspace_members table, and related indexes.

-- =============================================================================
-- workspaces table
-- =============================================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references public.profiles(id),
  city text,
  business_type text not null default 'residential_lease',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- workspace_members table (no updated_at per domain-model 2.3)
-- =============================================================================
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null default 'member',
  status public.member_status not null default 'invited',
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Reverse lookup: user's workspaces with status filter
create index idx_workspace_members_user_workspace_status
  on public.workspace_members(user_id, workspace_id, status);

-- Workspace owner lookup
create index idx_workspaces_owner
  on public.workspaces(owner_user_id);

-- =============================================================================
-- Trigger: set_updated_at on workspaces
-- =============================================================================
create trigger set_updated_at before update on public.workspaces
  for each row execute function private.set_updated_at();
