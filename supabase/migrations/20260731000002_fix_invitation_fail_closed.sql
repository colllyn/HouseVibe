-- Migration: Fix invitation email validation — fail closed
-- Bug: accept_workspace_invitation skipped email check when recipient_email is NULL,
-- allowing any authenticated user to accept an un-targeted invitation.
-- This migration replaces the function with fail-closed logic.
-- Phase 1-B2: Auth, Onboarding, and Invitation Join — PHASE1B-AUTH-FINALIZE-003

-- =============================================================================
-- CREATE OR REPLACE FUNCTION: accept_workspace_invitation (fixed)
-- Same function body as 20260731000001_invitation_links.sql except:
--   Step 7 now fails closed: recipient_email IS NULL raises IV006.
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

  -- 7. Validate email match (recipient_email is REQUIRED — fail closed)
  if v_invitation.recipient_email is null then
    raise exception 'Invitation recipient email is required' using errcode = 'IV006';
  end if;

  if lower(v_invitation.recipient_email) != lower(v_user_email) then
    raise exception 'Email does not match invitation' using errcode = 'IV005';
  end if;

  -- 8. Validate workspace exists and is valid
  if not exists (select 1 from public.workspaces where id = v_invitation.target_workspace_id) then
    raise exception 'Workspace not found' using errcode = 'WS001';
  end if;

  -- 9. Create or reactivate workspace membership
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
      raise;
end;
$$;
