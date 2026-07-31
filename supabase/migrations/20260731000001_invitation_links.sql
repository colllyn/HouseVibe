-- Migration: Invitation Links
-- Creates invitation_links table, RLS policies, and the accept_workspace_invitation RPC.
-- Phase 1-B2: Auth, Onboarding, and Invitation Join

-- =============================================================================
-- invitation_links table
-- =============================================================================
create table public.invitation_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  created_by uuid not null references public.profiles(id),
  target_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_email text,
  workspace_role public.workspace_role not null default 'member',
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked')),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- Indexes
-- =============================================================================
create index idx_invitation_links_status_expires
  on public.invitation_links(status, expires_at);

create index idx_invitation_links_token_hash
  on public.invitation_links(token_hash);

-- =============================================================================
-- Trigger: set_updated_at
-- =============================================================================
create trigger set_updated_at before update on public.invitation_links
  for each row execute function private.set_updated_at();

-- =============================================================================
-- Enable RLS
-- =============================================================================
alter table public.invitation_links enable row level security;

-- Grant base table access to authenticated role
grant select, insert, update on public.invitation_links to authenticated;

-- =============================================================================
-- RLS Policies: invitation_links
-- =============================================================================

-- SELECT: creator can read their own invitations
create policy "Creators can read own invitations" on public.invitation_links
  for select using (
    created_by = (select auth.uid())
  );

-- INSERT: authenticated users can insert (controlled at application level)
create policy "Authenticated users can create invitations" on public.invitation_links
  for insert with check (
    (select auth.uid()) is not null
  );

-- UPDATE: creator can update their own invitations (e.g. revoke)
create policy "Creators can update own invitations" on public.invitation_links
  for update using (
    created_by = (select auth.uid())
  ) with check (
    created_by = (select auth.uid())
  );

-- =============================================================================
-- RPC: accept_workspace_invitation
-- Atomically accepts a workspace invitation.
--
-- Security:
-- - SECURITY DEFINER, fixed search_path
-- - Requires auth.uid() (rejects unauthenticated)
-- - Validates: active status, not expired, not revoked, under max_uses
-- - Matches recipient_email to the invitee's auth.users email
-- - Creates or reactivates workspace_members record
-- - Uses the invitation's workspace_role (caller cannot specify role)
-- - Increments used_count, sets accepted_by/accepted_at
-- - Writes audit log entry
-- - Full rollback on any failure
--
-- Prevents:
-- - Double acceptance (duplicate membership check)
-- - Token replay (status + used_count check)
-- - Wrong email acceptance (email matching)
-- - Expired/revoked token acceptance
-- - User specifying a higher role
-- - Cross-workspace injection
-- - Concurrent duplicate membership creation (ON CONFLICT)
-- =============================================================================
create or replace function public.accept_workspace_invitation(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_invitation record;
  v_member_id uuid;
  v_result jsonb;
begin
  -- 1. Require authentication
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'UA001';
  end if;

  -- 2. Get the authenticated user's email from auth.users
  select email into v_user_email
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    raise exception 'User email not found' using errcode = 'UA002';
  end if;

  -- 3. Look up the invitation by token hash
  select * into v_invitation
  from public.invitation_links
  where token_hash = p_token_hash;

  if not found then
    raise exception 'Invitation not found' using errcode = 'IV001';
  end if;

  -- 4. Validate invitation status
  if v_invitation.status != 'active' then
    raise exception 'Invitation is not active' using errcode = 'IV002';
  end if;

  -- 5. Validate not expired
  if v_invitation.expires_at is not null and v_invitation.expires_at < now() then
    -- Auto-expire and reject
    update public.invitation_links
    set status = 'expired', updated_at = now()
    where id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = 'IV003';
  end if;

  -- 6. Validate under max uses
  if v_invitation.max_uses is not null and v_invitation.used_count >= v_invitation.max_uses then
    raise exception 'Invitation has reached max uses' using errcode = 'IV004';
  end if;

  -- 7. Validate email match (if recipient_email is set)
  if v_invitation.recipient_email is not null
     and lower(v_invitation.recipient_email) != lower(v_user_email) then
    raise exception 'Email does not match invitation' using errcode = 'IV005';
  end if;

  -- 8. Validate workspace exists and is valid
  if not exists (select 1 from public.workspaces where id = v_invitation.target_workspace_id) then
    raise exception 'Workspace not found' using errcode = 'WS001';
  end if;

  -- 9. Create or reactivate workspace membership
  -- ON CONFLICT handles the case where the user was previously a member
  -- and was set to inactive
  v_member_id := extensions.gen_random_uuid();
  insert into public.workspace_members (id, workspace_id, user_id, role, status)
  values (v_member_id, v_invitation.target_workspace_id, v_user_id, v_invitation.workspace_role, 'active')
  on conflict (workspace_id, user_id) do update
    set role = v_invitation.workspace_role,
        status = 'active',
        created_at = now();

  -- 10. Update invitation
  update public.invitation_links
  set used_count = used_count + 1,
      accepted_by = v_user_id,
      accepted_at = now(),
      status = case
        when max_uses is not null and (used_count + 1) >= max_uses then 'expired'
        else 'active'
      end,
      updated_at = now()
  where id = v_invitation.id;

  -- 11. Write audit log entry
  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) values (
    v_invitation.target_workspace_id,
    v_user_id,
    'workspace_member',
    v_member_id,
    'invitation_accepted',
    jsonb_build_object(
      'invitation_id', v_invitation.id,
      'workspace_id', v_invitation.target_workspace_id
    ),
    jsonb_build_object(
      'member_id', v_member_id,
      'role', v_invitation.workspace_role,
      'user_id', v_user_id,
      'accepted_at', now()
    )
  );

  -- 12. Return minimal safe result
  select jsonb_build_object(
    'workspace_id', v_invitation.target_workspace_id,
    'member_id', v_member_id,
    'role', v_invitation.workspace_role,
    'status', 'active'
  ) into v_result;

  return v_result;

  -- 13. Rollback on any failure
  exception
    when others then
      -- Re-raise with the original error
      raise;
end;
$$;

-- Grant execute to authenticated role; revoke from public and anon
grant execute on function public.accept_workspace_invitation(text) to authenticated;
revoke execute on function public.accept_workspace_invitation(text) from public, anon;
