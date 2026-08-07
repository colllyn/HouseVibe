-- Migration: Final release blockers fix
-- P0-1: Add shared properties cross-workspace SELECT policy
-- P0-2: Drop physical DELETE policies violating soft-delete rule
-- P0-3: Create write_audit_log SECURITY DEFINER RPC

-- =============================================================================
-- P0-2: Drop physical DELETE policies (violate "所有删除使用软删除" rule)
-- =============================================================================
DROP POLICY IF EXISTS "Owner can delete properties" ON public.properties;
DROP POLICY IF EXISTS "Owner can delete media" ON public.property_media;
DROP POLICY IF EXISTS "Owner can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Workspace members can delete interactions" ON public.interactions;

-- =============================================================================
-- P0-1: Shared properties cross-workspace SELECT
-- Allow any authenticated user to read properties flagged as shared.
-- Column-level filtering is enforced at the application layer (SHARED_PROPERTY_COLS
-- in src/features/collaboration/schemas.ts) and the property_private_details table
-- has its own strict RLS. A dedicated shared_properties_view is planned per
-- rls-contract §4.4 for defense-in-depth column enforcement.
-- =============================================================================
DROP POLICY IF EXISTS "Any authenticated user can read shared properties" ON public.properties;
CREATE POLICY "Any authenticated user can read shared properties"
  ON public.properties
  FOR SELECT
  USING (is_shared = true AND deleted_at IS NULL);

-- =============================================================================
-- P0-3: write_audit_log SECURITY DEFINER RPC
-- Replaces broken direct client.from("audit_logs").insert() calls that used
-- incorrect column names (user_id→actor_user_id, resource_type→entity_type,
-- resource_id→entity_id, metadata→after_data) and were blocked by missing
-- INSERT RLS policy.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public, pg_catalog'
AS $$
BEGIN
  -- Validate caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) VALUES (
    p_workspace_id, auth.uid(), p_action, p_entity_type, p_entity_id,
    p_before_data, p_after_data
  );
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) TO authenticated;
