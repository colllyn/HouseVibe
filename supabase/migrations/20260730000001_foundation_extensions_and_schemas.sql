-- Migration: Foundation Extensions and Schemas
-- Creates required PostgreSQL extensions, enum types, and private schema.

-- Extensions
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pgtap" with schema extensions;

-- Enum types
create type public.workspace_role as enum ('owner', 'member', 'external_collaborator');
create type public.member_status as enum ('active', 'inactive', 'invited');

-- Private schema for helper functions and internal logic
create schema if not exists private;

-- Revoke public/anonymous access; authenticated needs USAGE to call
-- SECURITY DEFINER helper functions referenced in RLS policies.
-- USAGE on a schema does NOT allow creating objects or listing contents;
-- functions are accessed only via explicit EXECUTE grants.
revoke usage on schema private from public, anon;
grant usage on schema private to authenticated, postgres;
