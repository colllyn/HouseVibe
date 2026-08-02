-- Migration: Phase 2 Business Tables
-- Creates 10 ENUM types and 8 core business tables with indexes and RLS policies.
-- All tables enable RLS with default-deny. Policies use private.is_workspace_member().
-- Soft-delete pattern (deleted_at IS NULL) for deletable entities.
--
-- ENUM types: property_status, media_type, ai_analysis_status, client_stage,
--   interaction_type, match_level, match_status, task_type, task_status, collab_req_status
--
-- Tables: properties, property_private_details, property_media, clients,
--   interactions, property_matches, tasks, collaboration_requests

begin;

-- =============================================================================
-- 1. ENUM Types
-- =============================================================================

create type public.property_status as enum (
  'draft',
  'available',
  'reserved',
  'rented',
  'offline',
  'expired',
  'deleted'
);

create type public.media_type as enum (
  'image',
  'video'
);

create type public.ai_analysis_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

create type public.client_stage as enum (
  'new',
  'qualified',
  'properties_sent',
  'viewing_scheduled',
  'viewed',
  'considering',
  'closed_won',
  'paused',
  'lost',
  'deleted'
);

create type public.interaction_type as enum (
  'phone_call',
  'wechat_message',
  'in_person_meeting',
  'property_viewing',
  'follow_up',
  'negotiation',
  'contract_signing',
  'complaint',
  'other'
);

create type public.match_level as enum (
  'excellent',
  'good',
  'fair',
  'low'
);

create type public.match_status as enum (
  'active',
  'dismissed',
  'archived'
);

create type public.task_type as enum (
  'contact_client',
  'send_property',
  'confirm_viewing',
  'follow_up_viewing',
  'update_property_status',
  'contact_owner',
  'publish_content',
  'update_content_data',
  'follow_up_collaboration'
);

create type public.task_status as enum (
  'todo',
  'in_progress',
  'done',
  'cancelled'
);

create type public.collab_req_status as enum (
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'completed'
);

-- =============================================================================
-- 2. properties Table
-- Per domain-model v1.0 section 2.4.
-- =============================================================================

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null,
  city text not null,
  district text,
  business_area text,
  community_name text,
  address_text text,
  building_no text,
  unit_no text,
  room_no text,
  rental_type text not null default 'whole_unit',
  monthly_rent integer,
  deposit_terms text,
  bedrooms integer,
  living_rooms integer,
  bathrooms integer,
  area_sqm numeric,
  floor integer,
  total_floors integer,
  has_elevator boolean,
  orientation text,
  decoration text,
  available_from date,
  minimum_lease_months integer,
  pets_allowed boolean,
  cooking_allowed boolean,
  subway_text text,
  facilities jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}'::text[],
  selling_points text[] not null default '{}'::text[],
  drawbacks text[] not null default '{}'::text[],
  description text,
  visual_summary text,
  visual_fact_flags jsonb not null default '[]'::jsonb,
  status public.property_status not null default 'draft',
  is_shared boolean not null default false,
  allow_marketing_reuse boolean not null default false,
  marketing_reuse_granted_at timestamptz,
  shared_at timestamptz,
  shared_expires_at timestamptz,
  commission_split text,
  raw_input_text text,
  source_type text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- properties indexes
create index idx_properties_workspace_status_deleted
  on public.properties(workspace_id, status, deleted_at);

create index idx_properties_workspace_district_rent
  on public.properties(workspace_id, district, monthly_rent);

create index idx_properties_workspace_available_from
  on public.properties(workspace_id, available_from);

create index idx_properties_shared_expires
  on public.properties(is_shared, shared_expires_at)
  where is_shared = true;

-- =============================================================================
-- 3. property_private_details Table
-- Per domain-model v1.0 section 2.5.
-- All fields HIGH sensitivity. MUST NOT enter shared views or shared API responses.
-- =============================================================================

create table public.property_private_details (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_name text,
  owner_phone text,
  owner_wechat text,
  exact_address text,
  internal_notes text,
  key_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id)
);

-- property_private_details indexes
create index idx_property_private_details_property
  on public.property_private_details(property_id);

create index idx_property_private_details_workspace
  on public.property_private_details(workspace_id);

-- =============================================================================
-- 4. property_media Table
-- Per domain-model v1.0 section 2.6.
-- =============================================================================

create table public.property_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null,
  media_type public.media_type not null default 'image',
  scene_tag text,
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  width integer,
  height integer,
  duration_seconds numeric,
  ai_labels jsonb,
  ai_analysis_status public.ai_analysis_status not null default 'pending',
  ai_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- property_media indexes
create index idx_property_media_property_analysis
  on public.property_media(property_id, ai_analysis_status);

create index idx_property_media_property_sort
  on public.property_media(property_id, sort_order);

-- =============================================================================
-- 5. clients Table
-- Per domain-model v1.0 section 2.7.
-- =============================================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null,
  phone text,
  wechat text,
  source_platform text,
  source_content_id uuid,
  first_property_id uuid references public.properties(id) on delete set null,
  budget_min integer,
  budget_max integer,
  preferred_districts text[] not null default '{}'::text[],
  preferred_communities text[] not null default '{}'::text[],
  bedrooms integer,
  rental_type text,
  available_from date,
  minimum_lease_months integer,
  pets_required boolean,
  cooking_required boolean,
  commute_destination text,
  hard_requirements jsonb not null default '[]'::jsonb,
  soft_preferences jsonb not null default '[]'::jsonb,
  deal_breakers text[] not null default '{}'::text[],
  stage public.client_stage not null default 'new',
  raw_input_text text,
  next_follow_up_at timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- clients indexes
create index idx_clients_workspace_stage_deleted
  on public.clients(workspace_id, stage, deleted_at);

create index idx_clients_workspace_follow_up
  on public.clients(workspace_id, next_follow_up_at);

-- =============================================================================
-- 6. interactions Table
-- Per domain-model v1.0 section 2.8.
-- =============================================================================

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  interaction_type public.interaction_type not null,
  summary text,
  raw_text text,
  next_action text,
  occurred_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- interactions indexes
create index idx_interactions_client_occurred
  on public.interactions(client_id, occurred_at desc);

create index idx_interactions_workspace_created
  on public.interactions(workspace_id, created_at);

-- =============================================================================
-- 7. property_matches Table
-- Per domain-model v1.0 section 2.9.
-- =============================================================================

create table public.property_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  score integer not null default 0,
  match_level public.match_level not null default 'low',
  matched_reasons jsonb not null default '[]'::jsonb,
  unmatched_reasons jsonb not null default '[]'::jsonb,
  needs_confirmation jsonb not null default '[]'::jsonb,
  status public.match_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, client_id)
);

-- property_matches indexes
create index idx_property_matches_workspace_status
  on public.property_matches(workspace_id, status);

create index idx_property_matches_client_score
  on public.property_matches(client_id, score desc);

create index idx_property_matches_property_score
  on public.property_matches(property_id, score desc);

-- =============================================================================
-- 8. tasks Table
-- Per domain-model v1.0 section 2.13.
-- =============================================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id),
  task_type public.task_type not null,
  title text not null,
  description text,
  property_id uuid references public.properties(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  content_project_id uuid,
  collaboration_request_id uuid,
  status public.task_status not null default 'todo',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- tasks indexes
create index idx_tasks_workspace_status_due
  on public.tasks(workspace_id, status, due_at);

create index idx_tasks_assigned_status
  on public.tasks(assigned_to, status);

-- =============================================================================
-- 9. collaboration_requests Table
-- Per domain-model v1.0 section 2.15.
-- Cross-workspace: requester_workspace_id and owner_workspace_id.
-- =============================================================================

create table public.collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  requester_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  message text,
  status public.collab_req_status not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- collaboration_requests indexes
create index idx_collab_req_owner_status
  on public.collaboration_requests(owner_workspace_id, status);

create index idx_collab_req_requester_status
  on public.collaboration_requests(requester_workspace_id, status);

-- =============================================================================
-- 10. updated_at Triggers
-- =============================================================================

create trigger trg_properties_updated_at before update on public.properties
  for each row execute function private.set_updated_at();

create trigger trg_property_private_details_updated_at before update on public.property_private_details
  for each row execute function private.set_updated_at();

create trigger trg_clients_updated_at before update on public.clients
  for each row execute function private.set_updated_at();

create trigger trg_property_matches_updated_at before update on public.property_matches
  for each row execute function private.set_updated_at();

create trigger trg_tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

create trigger trg_collaboration_requests_updated_at before update on public.collaboration_requests
  for each row execute function private.set_updated_at();

-- =============================================================================
-- 11. Enable RLS on all 8 tables
-- =============================================================================

alter table public.properties enable row level security;
alter table public.property_private_details enable row level security;
alter table public.property_media enable row level security;
alter table public.clients enable row level security;
alter table public.interactions enable row level security;
alter table public.property_matches enable row level security;
alter table public.tasks enable row level security;
alter table public.collaboration_requests enable row level security;

-- Grant base table access to authenticated role.
-- RLS policies (below) restrict access to authorized rows only.
grant select, insert, update on public.properties to authenticated;
grant select, insert, update on public.property_private_details to authenticated;
grant select, insert, update on public.property_media to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, insert, update on public.interactions to authenticated;
grant select, insert, update on public.property_matches to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert, update on public.collaboration_requests to authenticated;

-- =============================================================================
-- 12. RLS Policies: properties
-- Per rls-contract v1.0 section 4.4.
-- =============================================================================

-- SELECT: workspace members can read non-deleted properties
create policy "Workspace members can read properties" on public.properties
  for select using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  );

-- INSERT: workspace members can create properties
create policy "Workspace members can create properties" on public.properties
  for insert with check (
    private.is_workspace_member(workspace_id)
  );

-- UPDATE: workspace members can update non-deleted properties
create policy "Workspace members can update properties" on public.properties
  for update using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  ) with check (
    private.is_workspace_member(workspace_id)
  );

-- DELETE: only owner can physical-delete properties (soft-delete is via UPDATE)
create policy "Owner can delete properties" on public.properties
  for delete using (
    private.is_workspace_owner(workspace_id)
  );

-- =============================================================================
-- 13. RLS Policies: property_private_details
-- Per rls-contract v1.0 section 4.5.
-- All fields HIGH sensitivity. Only workspace members can read/write.
-- =============================================================================

create policy "Workspace members can read private details" on public.property_private_details
  for select using (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can insert private details" on public.property_private_details
  for insert with check (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can update private details" on public.property_private_details
  for update using (
    private.is_workspace_member(workspace_id)
  ) with check (
    private.is_workspace_member(workspace_id)
  );

-- No DELETE policy — private details are cascade-deleted or left intact on property soft-delete.
-- Domain-model 4.5: "随 properties 软删除" — no direct DELETE.

-- =============================================================================
-- 14. RLS Policies: property_media
-- Per rls-contract v1.0 section 4.6.
-- =============================================================================

-- SELECT: workspace members can read non-deleted media
create policy "Workspace members can read media" on public.property_media
  for select using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  );

-- SELECT: shared property media is viewable by any authenticated user
create policy "Shared property media is viewable" on public.property_media
  for select using (
    exists (
      select 1 from public.properties
      where properties.id = property_media.property_id
        and properties.is_shared = true
        and properties.status = 'available'
        and properties.deleted_at is null
    )
    and property_media.deleted_at is null
  );

-- INSERT: workspace members can upload media
create policy "Workspace members can insert media" on public.property_media
  for insert with check (
    private.is_workspace_member(workspace_id)
  );

-- UPDATE: workspace members can update media (e.g., ai_labels)
create policy "Workspace members can update media" on public.property_media
  for update using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  ) with check (
    private.is_workspace_member(workspace_id)
  );

-- DELETE: owner can soft-delete media
create policy "Owner can delete media" on public.property_media
  for delete using (
    private.is_workspace_owner(workspace_id)
  );

-- =============================================================================
-- 15. RLS Policies: clients
-- Per rls-contract v1.0 section 4.7.
-- =============================================================================

create policy "Workspace members can read clients" on public.clients
  for select using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  );

create policy "Workspace members can create clients" on public.clients
  for insert with check (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can update clients" on public.clients
  for update using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  ) with check (
    private.is_workspace_member(workspace_id)
  );

create policy "Owner can delete clients" on public.clients
  for delete using (
    private.is_workspace_owner(workspace_id)
  );

-- =============================================================================
-- 16. RLS Policies: interactions
-- Per rls-contract v1.0 section 4.8.
-- =============================================================================

create policy "Workspace members can read interactions" on public.interactions
  for select using (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can create interactions" on public.interactions
  for insert with check (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can update interactions" on public.interactions
  for update using (
    private.is_workspace_member(workspace_id)
  ) with check (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can delete interactions" on public.interactions
  for delete using (
    private.is_workspace_member(workspace_id)
  );

-- =============================================================================
-- 17. RLS Policies: property_matches
-- Per rls-contract v1.0 section 4.9.
-- =============================================================================

create policy "Workspace members can read matches" on public.property_matches
  for select using (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can create matches" on public.property_matches
  for insert with check (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can update matches" on public.property_matches
  for update using (
    private.is_workspace_member(workspace_id)
  ) with check (
    private.is_workspace_member(workspace_id)
  );

-- No DELETE policy — matches are dismissed/archived via status, not deleted.
-- Domain-model 2.9: no deleted_at column; status transitions handle lifecycle.

-- =============================================================================
-- 18. RLS Policies: tasks
-- Per rls-contract v1.0 section 4.10.
-- =============================================================================

create policy "Workspace members can read tasks" on public.tasks
  for select using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  );

create policy "Workspace members can create tasks" on public.tasks
  for insert with check (
    private.is_workspace_member(workspace_id)
  );

create policy "Workspace members can update tasks" on public.tasks
  for update using (
    private.is_workspace_member(workspace_id)
    and deleted_at is null
  ) with check (
    private.is_workspace_member(workspace_id)
  );

-- DELETE: workspace members can soft-delete tasks
create policy "Workspace members can delete tasks" on public.tasks
  for delete using (
    private.is_workspace_member(workspace_id)
  );

-- =============================================================================
-- 19. RLS Policies: collaboration_requests
-- Per rls-contract v1.0 section 4.12.
-- Cross-workspace access: requesters see own, owners see received, SA sees all.
-- =============================================================================

-- SELECT: requesters can read their own requests
create policy "Requesters can read own requests" on public.collaboration_requests
  for select using (
    private.is_workspace_member(requester_workspace_id)
  );

-- SELECT: owners can read received requests
create policy "Owners can read received requests" on public.collaboration_requests
  for select using (
    private.is_workspace_member(owner_workspace_id)
  );

-- SELECT: system admins can read all collaboration requests
create policy "System admins can read all collaboration requests" on public.collaboration_requests
  for select using (
    private.is_system_admin()
  );

-- INSERT: requester workspace members can create requests
create policy "Requesters can create collaboration requests" on public.collaboration_requests
  for insert with check (
    private.is_workspace_member(requester_workspace_id)
  );

-- UPDATE: owner workspace members can update (accept/reject) requests
create policy "Owners can update collaboration requests" on public.collaboration_requests
  for update using (
    private.is_workspace_member(owner_workspace_id)
  ) with check (
    private.is_workspace_member(owner_workspace_id)
  );

-- No DELETE policy — requests are cancelled/completed via status change.
-- Domain-model 3.5: status transitions handle lifecycle.

commit;
