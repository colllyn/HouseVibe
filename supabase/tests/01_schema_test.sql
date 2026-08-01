-- =============================================================================
-- 01_schema_test.sql -- Schema Validation
-- Verifies tables, columns, constraints, indexes, enums, triggers, and RLS.
--
-- Run: supabase test db
-- Prerequisites: All 5 foundation migrations applied.
-- =============================================================================

BEGIN;

-- Ensure pgTAP functions are accessible (pgTAP lives in extensions schema)
SET LOCAL search_path TO public, extensions;

SELECT plan(140);

-- =============================================================================
-- 1. Enums
-- =============================================================================
SELECT has_type('public', 'workspace_role', 'Enum workspace_role should exist');
SELECT has_type('public', 'member_status', 'Enum member_status should exist');
SELECT has_type('public', 'feature_key', 'Enum feature_key should exist');
SELECT has_type('public', 'entitlement_status', 'Enum entitlement_status should exist');

-- =============================================================================
-- 2. Table existence
-- =============================================================================
SELECT has_table('public', 'profiles', 'profiles table should exist');
SELECT has_table('public', 'workspaces', 'workspaces table should exist');
SELECT has_table('public', 'workspace_members', 'workspace_members table should exist');
SELECT has_table('public', 'audit_logs', 'audit_logs table should exist');
SELECT has_table('public', 'system_admins', 'system_admins table should exist');
SELECT has_table('public', 'feature_entitlements', 'feature_entitlements table should exist');

-- =============================================================================
-- 3. profiles -- columns and constraints
-- =============================================================================
SELECT has_column('public', 'profiles', 'id', 'profiles.id column');
SELECT has_column('public', 'profiles', 'full_name', 'profiles.full_name column');
SELECT has_column('public', 'profiles', 'phone', 'profiles.phone column');
SELECT has_column('public', 'profiles', 'avatar_url', 'profiles.avatar_url column');
SELECT has_column('public', 'profiles', 'city', 'profiles.city column');
SELECT has_column('public', 'profiles', 'created_at', 'profiles.created_at column');
SELECT has_column('public', 'profiles', 'updated_at', 'profiles.updated_at column');

SELECT col_is_pk('public', 'profiles', 'id', 'profiles.id is PK');
SELECT col_not_null('public', 'profiles', 'created_at', 'profiles.created_at NOT NULL');
SELECT col_not_null('public', 'profiles', 'updated_at', 'profiles.updated_at NOT NULL');

-- =============================================================================
-- 4. workspaces -- columns and constraints
-- =============================================================================
SELECT has_column('public', 'workspaces', 'id', 'workspaces.id column');
SELECT has_column('public', 'workspaces', 'name', 'workspaces.name column');
SELECT has_column('public', 'workspaces', 'owner_user_id', 'workspaces.owner_user_id column');
SELECT has_column('public', 'workspaces', 'city', 'workspaces.city column');
SELECT has_column('public', 'workspaces', 'business_type', 'workspaces.business_type column');
SELECT has_column('public', 'workspaces', 'created_at', 'workspaces.created_at column');
SELECT has_column('public', 'workspaces', 'updated_at', 'workspaces.updated_at column');

SELECT col_is_pk('public', 'workspaces', 'id', 'workspaces.id is PK');
SELECT col_is_fk('public', 'workspaces', 'owner_user_id', 'workspaces.owner_user_id FK to profiles');
SELECT col_not_null('public', 'workspaces', 'name', 'workspaces.name NOT NULL');
SELECT col_not_null('public', 'workspaces', 'owner_user_id', 'workspaces.owner_user_id NOT NULL');
SELECT col_not_null('public', 'workspaces', 'business_type', 'workspaces.business_type NOT NULL');
SELECT col_not_null('public', 'workspaces', 'created_at', 'workspaces.created_at NOT NULL');
SELECT col_not_null('public', 'workspaces', 'updated_at', 'workspaces.updated_at NOT NULL');

-- =============================================================================
-- 5. workspace_members -- columns and constraints
-- =============================================================================
SELECT has_column('public', 'workspace_members', 'id', 'workspace_members.id column');
SELECT has_column('public', 'workspace_members', 'workspace_id', 'workspace_members.workspace_id column');
SELECT has_column('public', 'workspace_members', 'user_id', 'workspace_members.user_id column');
SELECT has_column('public', 'workspace_members', 'role', 'workspace_members.role column');
SELECT has_column('public', 'workspace_members', 'status', 'workspace_members.status column');
SELECT has_column('public', 'workspace_members', 'created_at', 'workspace_members.created_at column');

SELECT col_is_pk('public', 'workspace_members', 'id', 'workspace_members.id is PK');
SELECT col_is_fk('public', 'workspace_members', 'workspace_id', 'workspace_members.workspace_id FK to workspaces');
SELECT col_is_fk('public', 'workspace_members', 'user_id', 'workspace_members.user_id FK to profiles');
SELECT col_not_null('public', 'workspace_members', 'workspace_id', 'workspace_members.workspace_id NOT NULL');
SELECT col_not_null('public', 'workspace_members', 'user_id', 'workspace_members.user_id NOT NULL');
SELECT col_not_null('public', 'workspace_members', 'role', 'workspace_members.role NOT NULL');
SELECT col_not_null('public', 'workspace_members', 'status', 'workspace_members.status NOT NULL');
SELECT col_not_null('public', 'workspace_members', 'created_at', 'workspace_members.created_at NOT NULL');

-- Unique constraint on (workspace_id, user_id)
SELECT ok(
  (SELECT count(*) > 0
   FROM pg_index i
   JOIN pg_class c ON i.indexrelid = c.oid
   WHERE i.indrelid = 'public.workspace_members'::regclass
     AND i.indisunique),
  'workspace_members has UNIQUE(workspace_id, user_id)'
);

-- =============================================================================
-- 6. audit_logs -- columns and constraints
-- =============================================================================
SELECT has_column('public', 'audit_logs', 'id', 'audit_logs.id column');
SELECT has_column('public', 'audit_logs', 'workspace_id', 'audit_logs.workspace_id column');
SELECT has_column('public', 'audit_logs', 'actor_user_id', 'audit_logs.actor_user_id column');
SELECT has_column('public', 'audit_logs', 'entity_type', 'audit_logs.entity_type column');
SELECT has_column('public', 'audit_logs', 'entity_id', 'audit_logs.entity_id column');
SELECT has_column('public', 'audit_logs', 'action', 'audit_logs.action column');
SELECT has_column('public', 'audit_logs', 'before_data', 'audit_logs.before_data column');
SELECT has_column('public', 'audit_logs', 'after_data', 'audit_logs.after_data column');
SELECT has_column('public', 'audit_logs', 'ip_address', 'audit_logs.ip_address column');
SELECT has_column('public', 'audit_logs', 'user_agent', 'audit_logs.user_agent column');
SELECT has_column('public', 'audit_logs', 'created_at', 'audit_logs.created_at column');

SELECT col_is_pk('public', 'audit_logs', 'id', 'audit_logs.id is PK');
SELECT col_is_fk('public', 'audit_logs', 'workspace_id', 'audit_logs.workspace_id FK to workspaces');
SELECT col_is_fk('public', 'audit_logs', 'actor_user_id', 'audit_logs.actor_user_id FK to profiles');
SELECT col_is_null('public', 'audit_logs', 'workspace_id', 'audit_logs.workspace_id can be NULL (system-level ops)');
SELECT col_not_null('public', 'audit_logs', 'actor_user_id', 'audit_logs.actor_user_id NOT NULL');
SELECT col_not_null('public', 'audit_logs', 'entity_type', 'audit_logs.entity_type NOT NULL');
SELECT col_not_null('public', 'audit_logs', 'entity_id', 'audit_logs.entity_id NOT NULL');
SELECT col_not_null('public', 'audit_logs', 'action', 'audit_logs.action NOT NULL');
SELECT col_not_null('public', 'audit_logs', 'created_at', 'audit_logs.created_at NOT NULL');

-- =============================================================================
-- 7. system_admins -- columns and constraints (Phase 1-C)
-- =============================================================================
SELECT has_column('public', 'system_admins', 'id', 'system_admins.id column');
SELECT has_column('public', 'system_admins', 'user_id', 'system_admins.user_id column');
SELECT has_column('public', 'system_admins', 'status', 'system_admins.status column');
SELECT has_column('public', 'system_admins', 'created_by', 'system_admins.created_by column');
SELECT has_column('public', 'system_admins', 'created_at', 'system_admins.created_at column');
SELECT has_column('public', 'system_admins', 'revoked_at', 'system_admins.revoked_at column');

SELECT col_is_pk('public', 'system_admins', 'id', 'system_admins.id is PK');
SELECT col_is_fk('public', 'system_admins', 'user_id', 'system_admins.user_id FK to profiles');
SELECT col_not_null('public', 'system_admins', 'user_id', 'system_admins.user_id NOT NULL');
SELECT col_not_null('public', 'system_admins', 'status', 'system_admins.status NOT NULL');

-- =============================================================================
-- 8. feature_entitlements -- columns and constraints (Phase 1-C)
-- =============================================================================
SELECT has_column('public', 'feature_entitlements', 'id', 'feature_entitlements.id column');
SELECT has_column('public', 'feature_entitlements', 'user_id', 'feature_entitlements.user_id column');
SELECT has_column('public', 'feature_entitlements', 'feature', 'feature_entitlements.feature column');
SELECT has_column('public', 'feature_entitlements', 'status', 'feature_entitlements.status column');
SELECT has_column('public', 'feature_entitlements', 'granted_by', 'feature_entitlements.granted_by column');
SELECT has_column('public', 'feature_entitlements', 'granted_at', 'feature_entitlements.granted_at column');
SELECT has_column('public', 'feature_entitlements', 'expires_at', 'feature_entitlements.expires_at column');
SELECT has_column('public', 'feature_entitlements', 'revoked_at', 'feature_entitlements.revoked_at column');
SELECT has_column('public', 'feature_entitlements', 'revoked_by', 'feature_entitlements.revoked_by column');
SELECT has_column('public', 'feature_entitlements', 'reason', 'feature_entitlements.reason column');
SELECT has_column('public', 'feature_entitlements', 'created_at', 'feature_entitlements.created_at column');
SELECT has_column('public', 'feature_entitlements', 'updated_at', 'feature_entitlements.updated_at column');

SELECT col_is_pk('public', 'feature_entitlements', 'id', 'feature_entitlements.id is PK');
SELECT col_is_fk('public', 'feature_entitlements', 'user_id', 'feature_entitlements.user_id FK to profiles');
SELECT col_is_fk('public', 'feature_entitlements', 'granted_by', 'feature_entitlements.granted_by FK to profiles');
SELECT col_not_null('public', 'feature_entitlements', 'user_id', 'feature_entitlements.user_id NOT NULL');
SELECT col_not_null('public', 'feature_entitlements', 'feature', 'feature_entitlements.feature NOT NULL');
SELECT col_not_null('public', 'feature_entitlements', 'status', 'feature_entitlements.status NOT NULL');
SELECT col_not_null('public', 'feature_entitlements', 'granted_by', 'feature_entitlements.granted_by NOT NULL');
SELECT col_not_null('public', 'feature_entitlements', 'granted_at', 'feature_entitlements.granted_at NOT NULL');

-- UNIQUE(user_id, feature)
SELECT ok(
  (SELECT count(*) > 0
   FROM pg_index i
   JOIN pg_class c ON i.indexrelid = c.oid
   WHERE i.indrelid = 'public.feature_entitlements'::regclass
     AND i.indisunique
     AND i.indkey::int[] && (
       SELECT array_agg(attnum::int)
       FROM pg_attribute
       WHERE attrelid = 'public.feature_entitlements'::regclass
         AND attname IN ('user_id', 'feature')
     )),
  'feature_entitlements has UNIQUE(user_id, feature)'
);

-- =============================================================================
-- 9. Indexes
-- =============================================================================
SELECT has_index('public', 'workspace_members', 'idx_workspace_members_user_workspace_status',
  ARRAY['user_id', 'workspace_id', 'status'],
  'Index idx_workspace_members_user_workspace_status');
SELECT has_index('public', 'workspaces', 'idx_workspaces_owner',
  ARRAY['owner_user_id'],
  'Index idx_workspaces_owner');
SELECT has_index('public', 'audit_logs', 'idx_audit_logs_entity',
  ARRAY['entity_type', 'entity_id'],
  'Index idx_audit_logs_entity');
SELECT has_index('public', 'audit_logs', 'idx_audit_logs_actor',
  ARRAY['actor_user_id', 'created_at'],
  'Index idx_audit_logs_actor');
SELECT has_index('public', 'audit_logs', 'idx_audit_logs_workspace',
  ARRAY['workspace_id', 'created_at'],
  'Index idx_audit_logs_workspace');
SELECT has_index('public', 'system_admins', 'idx_system_admins_active_user',
  ARRAY['user_id'],
  'Unique partial index idx_system_admins_active_user (WHERE status=active)');
SELECT has_index('public', 'system_admins', 'idx_system_admins_user_status',
  ARRAY['user_id', 'status'],
  'Index idx_system_admins_user_status');
SELECT has_index('public', 'feature_entitlements', 'idx_feature_entitlements_user_feature_status',
  ARRAY['user_id', 'feature', 'status'],
  'Index idx_feature_entitlements_user_feature_status');
SELECT has_index('public', 'feature_entitlements', 'idx_feature_entitlements_feature_status_expires',
  ARRAY['feature', 'status', 'expires_at'],
  'Index idx_feature_entitlements_feature_status_expires');

-- =============================================================================
-- 8. Triggers
-- =============================================================================
SELECT has_trigger('public', 'profiles', 'set_updated_at',
  'Trigger set_updated_at on profiles');
SELECT has_trigger('public', 'workspaces', 'set_updated_at',
  'Trigger set_updated_at on workspaces');
SELECT has_trigger('public', 'feature_entitlements', 'set_updated_at',
  'Trigger set_updated_at on feature_entitlements');
SELECT has_trigger('public', 'feature_entitlements', 'audit_feature_entitlement_change',
  'Trigger audit_feature_entitlement_change on feature_entitlements');

-- =============================================================================
-- 10. RLS enabled on all tables
-- =============================================================================
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'RLS enabled on profiles'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.workspaces'::regclass),
  'RLS enabled on workspaces'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.workspace_members'::regclass),
  'RLS enabled on workspace_members'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.audit_logs'::regclass),
  'RLS enabled on audit_logs'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.system_admins'::regclass),
  'RLS enabled on system_admins'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feature_entitlements'::regclass),
  'RLS enabled on feature_entitlements'
);

-- =============================================================================
-- 11. RLS Policy counts
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'),
  3, 'profiles: 3 RLS policies'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspaces'),
  2, 'workspaces: 2 RLS policies'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspace_members'),
  1, 'workspace_members: 1 RLS policy (SELECT only; UPDATE revoked per 20260801000004)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs'),
  1, 'audit_logs: 1 RLS policy (admin read)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_admins'),
  1, 'system_admins: 1 RLS policy'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feature_entitlements'),
  1, 'feature_entitlements: 1 RLS policy'
);

-- =============================================================================
-- 12. Helper functions and RPCs
-- =============================================================================
SELECT has_function('private', 'is_workspace_member', ARRAY['uuid'],
  'private.is_workspace_member(uuid) exists');
SELECT has_function('private', 'is_workspace_owner', ARRAY['uuid'],
  'private.is_workspace_owner(uuid) exists');
SELECT has_function('private', 'is_system_admin', ARRAY[]::text[],
  'private.is_system_admin() exists');
SELECT has_function('public', 'create_workspace_with_owner', ARRAY['text', 'text', 'text'],
  'public.create_workspace_with_owner(text,text,text) exists');

-- Phase 1-C authorization helpers
SELECT has_function('private', 'require_system_admin', ARRAY[]::text[],
  'private.require_system_admin() exists');
SELECT has_function('private', 'has_feature', ARRAY['public.feature_key'],
  'private.has_feature(feature_key) exists');
SELECT has_function('private', 'require_feature', ARRAY['public.feature_key'],
  'private.require_feature(feature_key) exists');
SELECT has_function('private', 'has_workspace_feature', ARRAY['uuid', 'public.feature_key'],
  'private.has_workspace_feature(uuid,feature_key) exists');
SELECT has_function('private', 'require_workspace_feature', ARRAY['uuid', 'public.feature_key'],
  'private.require_workspace_feature(uuid,feature_key) exists');

-- Phase 1-C admin RPCs
SELECT has_function('public', 'list_system_admins', ARRAY[]::text[],
  'public.list_system_admins() exists');
SELECT has_function('public', 'grant_system_admin', ARRAY['uuid'],
  'public.grant_system_admin(uuid) exists');
SELECT has_function('public', 'revoke_system_admin', ARRAY['uuid'],
  'public.revoke_system_admin(uuid) exists');
SELECT has_function('public', 'grant_feature_entitlement', ARRAY['uuid', 'public.feature_key', 'timestamptz'],
  'public.grant_feature_entitlement(uuid,feature_key,timestamptz) exists');
SELECT has_function('public', 'revoke_feature_entitlement', ARRAY['uuid', 'public.feature_key', 'text'],
  'public.revoke_feature_entitlement(uuid,feature_key,text) exists');
SELECT has_function('public', 'list_user_entitlements', ARRAY['uuid'],
  'public.list_user_entitlements(uuid) exists');

-- =============================================================================
-- Cleanup
-- =============================================================================
SELECT * FROM finish();

ROLLBACK;
