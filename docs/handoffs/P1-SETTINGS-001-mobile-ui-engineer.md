# P1-SETTINGS-001 Handoff: mobile-ui-engineer

## Created Components (in `src/components/ui/`)

### 1. `settings-layout.tsx` — SettingsLayout
Client component that provides settings sub-navigation:
- Mobile: horizontal tab bar (个人资料 | 工作区 | 隐私)
- Desktop: vertical sidebar on the left with content area on the right
- Active state based on `usePathname()`
- Import: `import { SettingsLayout } from "@/components/ui/settings-layout"`

### 2. `settings-section.tsx` — SettingsSection
Simple wrapper with consistent spacing, title, and description.
- Import: `import { SettingsSection } from "@/components/ui/settings-section"`

### 3. `settings-form-card.tsx` — SettingsFormCard
Reusable card for form sections:
- Props: `title`, `description`, `children`, `footer`, `className`, `error`, `successMessage`, `isSubmitting`
- Error banner at top when `error` is provided (destructive styling)
- Success banner at top when `successMessage` is provided (green styling)
- Disabled appearance when `isSubmitting` is true
- Footer area with border-top and muted background for action buttons
- Import: `import { SettingsFormCard } from "@/components/ui/settings-form-card"`

### 4. `profile-form.tsx` — ProfileForm
Full profile editing form:
- Zod schema: `ProfileFormSchema` (fullName: required, phone: optional, city: optional, avatarUrl: optional)
- Handles: loading, error, empty, editing, submitting, success states
- React Hook Form with `@hookform/resolvers/zod`
- Props: `initialData`, `isLoading`, `loadError`, `onRetryLoad`, `onSubmit`
- `onSubmit` signature: `(data: ProfileFormData) => Promise<{ error?: string; success?: boolean }>`
- Avatar preview with fallback icon
- Import: `import { ProfileForm, type ProfileFormData, ProfileFormSchema } from "@/components/ui/profile-form"`

### 5. `workspace-form.tsx` — WorkspaceForm
Workspace editing form:
- Zod schema: `WorkspaceFormSchema` (name: required, city: optional, businessType: optional)
- Handles: loading, error, empty, editing, submitting, success states
- Owner-only: when `isOwner={false}`, form fields are disabled + lockdown notice shown, footer hidden
- Props: `initialData`, `isLoading`, `loadError`, `onRetryLoad`, `isOwner`, `onSubmit`
- Import: `import { WorkspaceForm, type WorkspaceFormData, WorkspaceFormSchema } from "@/components/ui/workspace-form"`

### 6. `member-list.tsx` — MemberList
Workspace member management:
- Props: `members`, `isLoading`, `error`, `isOwner`, `currentUserId`, `onRetry`, `onRemoveMember`
- Member type: `MemberListMember { id, userId, fullName, avatarUrl, email, role, status }`
- Role badges with icons: 所有者 (crown), 成员 (shield), 外部协作 (user-plus)
- Status badges for non-active members
- Owner can remove non-owner members via ConfirmDialog (destructive variant)
- Self-identification ("我") displayed next to current user's name
- Cannot remove self
- Removed members show inline feedback
- Import: `import { MemberList, type MemberListMember } from "@/components/ui/member-list"`

### 7. `privacy-section.tsx` — PrivacySection
Privacy settings section:
- Privacy policy link (configurable `privacyPolicyUrl`, defaults to `/privacy-policy`)
- Data export button with loading/error/success states
- Account deletion button with ConfirmDialog (destructive variant)
- AI preferences placeholder (disabled, "即将开放")
- Props: `privacyPolicyUrl`, `onExportData`, `onDeleteAccount`, `isExporting`, `isDeleting`
- Import: `import { PrivacySection } from "@/components/ui/privacy-section"`

### 8. `confirm-dialog.tsx` — ConfirmDialog
Confirmation wrapper around `ResponsiveOverlay`:
- Props: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel`, `variant`, `isLoading`, `onConfirm`
- `variant`: `"default"` | `"destructive"` (destructive shows warning + red button)
- Cancel and confirm buttons with loading spinner
- 44px minimum touch targets
- Import: `import { ConfirmDialog } from "@/components/ui/confirm-dialog"`

## Navigation Changes

### `mobile-bottom-nav.tsx`
- "我的" tab is now **enabled**, points to `/settings/profile`
- Active detection now supports sub-paths (startsWith)

### `desktop-sidebar.tsx`
- "设置" link is now **enabled**, points to `/settings/profile`
- Active detection unchanged (pathname === href)

### `navigation.test.tsx`
- Updated to reflect enabled "我的/设置" navigation
- All 141 tests pass

## What data-security-engineer Needs to Create

### Page Routes
1. `src/app/(dashboard)/settings/layout.tsx` — Use `SettingsLayout` as wrapper
2. `src/app/(dashboard)/settings/page.tsx` — Redirect to `/settings/profile`
3. `src/app/(dashboard)/settings/profile/page.tsx` — Use `ProfileForm`
4. `src/app/(dashboard)/settings/workspace/page.tsx` — Use `WorkspaceForm` + `MemberList`
5. `src/app/(dashboard)/settings/privacy/page.tsx` — Use `PrivacySection`

### Server Actions
- `updateProfile` — Only update own profile, limited fields
- `updateWorkspace` — Only owner/admin, Zod validated
- `removeMember` — Only owner, not self
- Auth check: `auth.getUser()` not `getSession()`

### Zod Schemas
- Extend `src/features/auth/schemas.ts` or create separate settings schemas
- Profile update, workspace update schemas

### Integration Pattern
Each page component is minimal — just data fetching + component composition:

```tsx
// Example: profile/page.tsx
import { getAuthenticatedUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/ui/profile-form";
import { updateProfileAction } from "./actions";

export default async function ProfilePage() {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, city, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <ProfileForm
      initialData={{
        fullName: profile?.full_name,
        phone: profile?.phone,
        city: profile?.city,
        avatarUrl: profile?.avatar_url,
      }}
      onSubmit={updateProfileAction}
    />
  );
}
```

## Design Decisions
- All states covered: loading, empty, error, success, submitting
- 44px minimum touch targets throughout
- Chinese text in actual UTF-8 characters (no \uXXXX)
- Uses design tokens from globals.css (CSS variables, no hardcoded colors)
- Mobile-first: 320px no horizontal scroll, safe area support
- Desktop: sidebar sub-navigation pattern matching existing DesktopSidebar
- Dangerous operations require ConfirmDialog confirmation
- Permission-denied controls hidden (e.g., remove button for non-owners)
