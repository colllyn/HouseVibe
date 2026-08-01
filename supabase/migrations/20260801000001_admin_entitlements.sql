-- Migration: Admin System and Feature Entitlements
-- Phase 1-C: system_admins, feature_entitlements, authorization helpers, admin RPCs.
-- Replaces the is_system_admin() stub with real system_admins table check.
--
-- CRITICAL: All SECURITY DEFINER functions use SET search_path = ''.
-- Use fully qualified names. Default RLS = deny.
-- content_factory is NOT granted by default.

-- =============================================================================
-- 1. Feature Key Enum
-- =============================================================================
create type public.feature_key as enum (
  'ai_data_extraction',
  'semantic_search',
  'property_matching',
  'shared_property_pool',
  'content_factory'
);

-- =============================================================================
-- 2. Entitlement Status Enum
-- =============================================================================
create type public.entitlement_status as enum ('active', 'disabled', 'revoked');

-- =============================================================================
-- 3. system_admins Table
-- Per domain-model v1.0 section 2.17.
-- NO user access (not even read); only SECURITY DEFINER functions access it.
-- =============================================================================
create table public.system_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- UNIQUE partial index: only one active admin row per user
create unique index idx_system_admins_active_user
  on public.system_admins(user_id)
  where status = 'active';

-- Index for is_system_admin() core lookup
create index idx_system_admins_user_status
  on public.system_admins(user_id, status);

-- =============================================================================
-- 3a. system_admins RLS
-- =============================================================================
alter table public.system_admins enable row level security;

-- SELECT: system admins can read (via SECURITY DEFINER function)
create policy "System admins can read admin table" on public.system_admins
  for select using (private.is_system_admin());

-- No INSERT/UPDATE/DELETE policies — only service_role / SECURITY DEFINER functions write.
grant select on public.system_admins to authenticated;

-- =============================================================================
-- 4. feature_entitlements Table
-- Per domain-model v1.0 section 2.16 with Phase 1-C additions.
-- =============================================================================
create table public.feature_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  feature public.feature_key not null,
  status public.entitlement_status not null default 'active',
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, feature)
);

-- =============================================================================
-- 4a. feature_entitlements Indexes
-- =============================================================================

-- has_feature() core dependency: one user's active non-expired entitlements
create index idx_feature_entitlements_user_feature_status
  on public.feature_entitlements(user_id, feature, status);

-- Admin listing by feature with status and expiry filters
create index idx_feature_entitlements_feature_status_expires
  on public.feature_entitlements(feature, status, expires_at);

-- =============================================================================
-- 4b. feature_entitlements RLS
-- =============================================================================
alter table public.feature_entitlements enable row level security;

-- SELECT: user reads own entitlements; system admins read all
create policy "Users can read own entitlements" on public.feature_entitlements
  for select using (
    user_id = (select auth.uid())
    or private.is_system_admin()
  );

-- No INSERT/UPDATE/DELETE policies for authenticated — only service_role / SECURITY DEFINER RPCs write.
grant select on public.feature_entitlements to authenticated;

-- =============================================================================
-- 4c. feature_entitlements Triggers
-- =============================================================================

-- updated_at trigger (reuses existing private.set_updated_at)
create trigger set_updated_at before update on public.feature_entitlements
  for each row execute function private.set_updated_at();

-- Audit trigger: writes to audit_logs on INSERT and UPDATE
create or replace function private.audit_feature_entitlement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  -- Determine actor: use authenticated user if available, else granted_by
  v_actor := (select auth.uid());
  if v_actor is null then
    v_actor := new.granted_by;
  end if;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    null,  -- system-level operation, no workspace context
    v_actor,
    'feature_entitlement',
    new.id,
    case
      when tg_op = 'INSERT' then 'feature_entitlement_granted'
      when tg_op = 'UPDATE' and new.status = 'revoked' and old.status != 'revoked'
        then 'feature_entitlement_revoked'
      when tg_op = 'UPDATE' and new.status = 'disabled' and old.status != 'disabled'
        then 'feature_entitlement_disabled'
      when tg_op = 'UPDATE' and new.status = 'active' and old.status != 'active'
        then 'feature_entitlement_reactivated'
      else 'feature_entitlement_updated'
    end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

create trigger audit_feature_entitlement_change
  after insert or update on public.feature_entitlements
  for each row execute function private.audit_feature_entitlement_change();

-- =============================================================================
-- 5. Alter audit_logs: allow NULL workspace_id for system-level audit entries
-- (system_admin grants/revokes, feature entitlements are not workspace-scoped)
-- =============================================================================
alter table public.audit_logs
  alter column workspace_id drop not null;

-- =============================================================================
-- 6. Replace is_system_admin() stub with real implementation
-- =============================================================================
create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.system_admins
    where user_id = (select auth.uid())
    and status = 'active'
  );
$$;

-- Note: grants from foundation migration (20260730000005) remain intact:
--   grant execute on function private.is_system_admin() to authenticated;
--   revoke execute on function private.is_system_admin() from public, anon;

-- =============================================================================
-- 7. Authorization Helpers (private schema, SECURITY DEFINER)
-- =============================================================================

-- require_system_admin: raises exception if caller is not an active system admin
create or replace function private.require_system_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_system_admin() then
    raise exception 'System admin access required'
      using errcode = '42501';  -- insufficient_privilege
  end if;
end;
$$;

grant execute on function private.require_system_admin() to authenticated;
revoke execute on function private.require_system_admin() from public, anon;

-- =============================================================================

-- has_feature: checks if the current user holds an active, non-expired entitlement
create or replace function private.has_feature(p_feature public.feature_key)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.feature_entitlements
    where user_id = (select auth.uid())
      and feature = p_feature
      and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function private.has_feature(public.feature_key) to authenticated;
revoke execute on function private.has_feature(public.feature_key) from public, anon;

-- =============================================================================

-- require_feature: raises exception if caller lacks active entitlement
create or replace function private.require_feature(p_feature public.feature_key)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_feature(p_feature) then
    raise exception 'Feature "%" is not enabled for this user', p_feature
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function private.require_feature(public.feature_key) to authenticated;
revoke execute on function private.require_feature(public.feature_key) from public, anon;

-- =============================================================================

-- has_workspace_feature: checks if the workspace owner holds the feature entitlement
create or replace function private.has_workspace_feature(
  p_workspace_id uuid,
  p_feature public.feature_key
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.feature_entitlements fe
    join public.workspaces w on w.owner_user_id = fe.user_id
    where w.id = p_workspace_id
      and fe.feature = p_feature
      and fe.status = 'active'
      and (fe.expires_at is null or fe.expires_at > now())
  );
$$;

grant execute on function private.has_workspace_feature(uuid, public.feature_key) to authenticated;
revoke execute on function private.has_workspace_feature(uuid, public.feature_key) from public, anon;

-- =============================================================================

-- require_workspace_feature: raises exception if workspace owner lacks feature
create or replace function private.require_workspace_feature(
  p_workspace_id uuid,
  p_feature public.feature_key
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_workspace_feature(p_workspace_id, p_feature) then
    raise exception 'Feature "%" is not enabled for workspace "%"', p_feature, p_workspace_id
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function private.require_workspace_feature(uuid, public.feature_key) to authenticated;
revoke execute on function private.require_workspace_feature(uuid, public.feature_key) from public, anon;

-- =============================================================================
-- 8. Admin RPCs (public schema, SECURITY DEFINER, admin-only)
-- =============================================================================

-- list_system_admins: returns all system admins with profile info (admin only)
create or replace function public.list_system_admins()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_system_admin();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', sa.id,
      'user_id', sa.user_id,
      'status', sa.status,
      'created_by', sa.created_by,
      'created_at', sa.created_at,
      'revoked_at', sa.revoked_at,
      'email', u.email,
      'full_name', p.full_name
    )
    order by sa.created_at desc
  ), '[]'::jsonb) into v_result
  from public.system_admins sa
  left join auth.users u on u.id = sa.user_id
  left join public.profiles p on p.id = sa.user_id;

  return v_result;
end;
$$;

grant execute on function public.list_system_admins() to authenticated;
revoke execute on function public.list_system_admins() from public, anon;

-- =============================================================================

-- grant_system_admin: promotes a user to system admin (admin only, cannot self-grant)
create or replace function public.grant_system_admin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_admin_row_id uuid;
  v_result jsonb;
begin
  perform private.require_system_admin();

  v_admin_id := (select auth.uid());

  -- Cannot self-grant
  if v_admin_id = p_user_id then
    raise exception 'Cannot self-grant system admin status'
      using errcode = '42501';
  end if;

  -- Verify target user has a profile
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User profile not found' using errcode = 'US001';
  end if;

  -- Insert or reactivate (upsert via the active-only partial unique index handles
  -- the case where a revoked admin is re-promoted)
  v_admin_row_id := extensions.gen_random_uuid();

  -- Check if already an active admin
  if exists (
    select 1 from public.system_admins
    where user_id = p_user_id and status = 'active'
  ) then
    raise exception 'User is already a system admin'
      using errcode = 'SA001';
  end if;

  -- Check if previously revoked (if so, reactivate)
  update public.system_admins
  set status = 'active',
      created_by = v_admin_id,
      created_at = now(),
      revoked_at = null
  where user_id = p_user_id and status = 'revoked';

  if not found then
    -- Fresh insert
    insert into public.system_admins (id, user_id, status, created_by, created_at)
    values (v_admin_row_id, p_user_id, 'active', v_admin_id, now());
  end if;

  -- Get the row id for audit
  select id into v_admin_row_id
  from public.system_admins
  where user_id = p_user_id and status = 'active';

  -- Audit: system_admin_granted
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    null,
    v_admin_id,
    'system_admin',
    v_admin_row_id,
    'system_admin_granted',
    null,
    jsonb_build_object(
      'user_id', p_user_id,
      'granted_by', v_admin_id,
      'granted_at', now()
    )
  );

  select jsonb_build_object(
    'id', v_admin_row_id,
    'user_id', p_user_id,
    'status', 'active',
    'granted_by', v_admin_id,
    'granted_at', now()
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.grant_system_admin(uuid) to authenticated;
revoke execute on function public.grant_system_admin(uuid) from public, anon;

-- =============================================================================

-- revoke_system_admin: revokes a system admin (admin only)
create or replace function public.revoke_system_admin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_admin_row_id uuid;
  v_result jsonb;
begin
  perform private.require_system_admin();

  v_admin_id := (select auth.uid());

  -- Find active admin row
  select id into v_admin_row_id
  from public.system_admins
  where user_id = p_user_id and status = 'active';

  if not found then
    raise exception 'User is not an active system admin'
      using errcode = 'SA002';
  end if;

  -- Revoke
  update public.system_admins
  set status = 'revoked',
      revoked_at = now()
  where id = v_admin_row_id;

  -- Audit: system_admin_revoked
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    null,
    v_admin_id,
    'system_admin',
    v_admin_row_id,
    'system_admin_revoked',
    jsonb_build_object('status', 'active', 'user_id', p_user_id),
    jsonb_build_object(
      'user_id', p_user_id,
      'status', 'revoked',
      'revoked_by', v_admin_id,
      'revoked_at', now()
    )
  );

  select jsonb_build_object(
    'id', v_admin_row_id,
    'user_id', p_user_id,
    'status', 'revoked',
    'revoked_by', v_admin_id,
    'revoked_at', now()
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.revoke_system_admin(uuid) to authenticated;
revoke execute on function public.revoke_system_admin(uuid) from public, anon;

-- =============================================================================

-- grant_feature_entitlement: grants or reactivates a feature entitlement (admin only)
create or replace function public.grant_feature_entitlement(
  p_user_id uuid,
  p_feature public.feature_key,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_entitlement_id uuid;
  v_result jsonb;
begin
  perform private.require_system_admin();

  v_admin_id := (select auth.uid());

  -- Verify target user has a profile
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User profile not found' using errcode = 'US001';
  end if;

  v_entitlement_id := extensions.gen_random_uuid();

  -- Upsert: insert if not exists, reactivate if disabled/revoked
  insert into public.feature_entitlements (
    id, user_id, feature, status, granted_by, granted_at, expires_at
  ) values (
    v_entitlement_id, p_user_id, p_feature, 'active', v_admin_id, now(), p_expires_at
  )
  on conflict (user_id, feature) do update
    set status = 'active',
        granted_by = v_admin_id,
        granted_at = now(),
        expires_at = p_expires_at,
        revoked_at = null,
        revoked_by = null,
        reason = null,
        updated_at = now()
  returning id into v_entitlement_id;

  -- Note: audit_log entry is written by the audit_feature_entitlement_change trigger

  select jsonb_build_object(
    'id', v_entitlement_id,
    'user_id', p_user_id,
    'feature', p_feature,
    'status', 'active',
    'granted_by', v_admin_id,
    'granted_at', now(),
    'expires_at', p_expires_at
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.grant_feature_entitlement(uuid, public.feature_key, timestamptz) to authenticated;
revoke execute on function public.grant_feature_entitlement(uuid, public.feature_key, timestamptz) from public, anon;

-- =============================================================================

-- revoke_feature_entitlement: immediately revokes a feature entitlement (admin only)
create or replace function public.revoke_feature_entitlement(
  p_user_id uuid,
  p_feature public.feature_key,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_entitlement_id uuid;
  v_result jsonb;
begin
  perform private.require_system_admin();

  v_admin_id := (select auth.uid());

  -- Find the active/disabled entitlement
  select id into v_entitlement_id
  from public.feature_entitlements
  where user_id = p_user_id
    and feature = p_feature
    and status in ('active', 'disabled');

  if not found then
    raise exception 'No active or disabled entitlement found for user "%" feature "%"',
      p_user_id, p_feature
      using errcode = 'FE001';
  end if;

  -- Revoke immediately
  update public.feature_entitlements
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = v_admin_id,
      reason = p_reason,
      updated_at = now()
  where id = v_entitlement_id;

  -- Note: audit_log entry is written by the audit_feature_entitlement_change trigger

  select jsonb_build_object(
    'id', v_entitlement_id,
    'user_id', p_user_id,
    'feature', p_feature,
    'status', 'revoked',
    'revoked_by', v_admin_id,
    'revoked_at', now(),
    'reason', p_reason
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.revoke_feature_entitlement(uuid, public.feature_key, text) to authenticated;
revoke execute on function public.revoke_feature_entitlement(uuid, public.feature_key, text) from public, anon;

-- =============================================================================

-- list_user_entitlements: returns entitlements for a user (admin or self only)
create or replace function public.list_user_entitlements(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_result jsonb;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- Only system admins or the user themselves can view entitlements
  if not private.is_system_admin() and v_caller_id != p_user_id then
    raise exception 'Access denied: only system admins or the target user can view entitlements'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', fe.id,
      'user_id', fe.user_id,
      'feature', fe.feature,
      'status', fe.status,
      'granted_by', fe.granted_by,
      'granted_at', fe.granted_at,
      'expires_at', fe.expires_at,
      'revoked_at', fe.revoked_at,
      'revoked_by', fe.revoked_by,
      'reason', fe.reason,
      'created_at', fe.created_at,
      'updated_at', fe.updated_at
    )
    order by fe.created_at desc
  ), '[]'::jsonb) into v_result
  from public.feature_entitlements fe
  where fe.user_id = p_user_id;

  return v_result;
end;
$$;

grant execute on function public.list_user_entitlements(uuid) to authenticated;
revoke execute on function public.list_user_entitlements(uuid) from public, anon;

-- =============================================================================
-- 9. Add audit_logs SELECT policy for system admins (deferred from Phase 1 foundation)
-- =============================================================================
create policy "System admins can read audit logs" on public.audit_logs
  for select using (private.is_system_admin());
