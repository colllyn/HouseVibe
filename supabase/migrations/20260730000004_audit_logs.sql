-- Migration: Audit Logs
-- Creates the audit_logs table for system audit trail.
-- No RLS SELECT policy — only service_role can read (Phase 1-C will add is_system_admin() policy).
-- Ordinary users MUST NOT update or delete audit_logs.

-- =============================================================================
-- audit_logs table
-- =============================================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  actor_user_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Entity-level audit trail lookup
create index idx_audit_logs_entity
  on public.audit_logs(entity_type, entity_id);

-- Actor-level audit trail (most recent first)
create index idx_audit_logs_actor
  on public.audit_logs(actor_user_id, created_at desc);

-- Workspace-level audit trail (most recent first)
create index idx_audit_logs_workspace
  on public.audit_logs(workspace_id, created_at desc);
