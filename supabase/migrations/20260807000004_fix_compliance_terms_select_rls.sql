-- Fix: Restrict compliance_terms SELECT to system admins only
-- Previously "Anyone can read active compliance terms" allowed any authenticated
-- user to enumerate the full compliance term list, which violates rls-contract §4.25
-- and could aid deliberate evasion of content compliance checks.
-- The compliance scanner (src/lib/compliance/check.ts) uses hardcoded rules,
-- not database reads, so this restriction does not affect compliance scanning.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can read active compliance terms" ON public.compliance_terms;

-- Replace with system-admin-only SELECT policy
CREATE POLICY "Only system admins can read compliance terms"
  ON public.compliance_terms
  FOR SELECT
  USING (private.is_system_admin());
