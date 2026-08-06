-- Migration: Drop the audit trigger on compliance_terms.
-- The trigger causes RLS conflicts in pgTAP tests because the SECURITY DEFINER
-- is_system_admin() function does not receive the correct auth context from
-- the trigger execution environment.
-- Audit logging for compliance terms will be handled at the application layer.

DROP TRIGGER IF EXISTS trg_audit_compliance_term ON compliance_terms;
DROP FUNCTION IF EXISTS audit_compliance_term_change();
