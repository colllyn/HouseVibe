# Phase 1-B2 Mobile UI Review

**Reviewer**: mobile-ui-engineer
**Date**: 2026-07-31
**Scope**: 6 pages at viewports 320x568, 375x667, 390x844, 768x1024

---

## Summary Table

| Page | File | Owner (OWNERSHIP.md) | Layout 320px | Touch Targets 44px | Forms & Labels | Loading/Error | Token Security | Chinese UTF-8 | A11y |
|---|---|---|---|---|---|---|---|---|---|
| Login | `src/app/(auth)/login/page.tsx` | data-security-engineer | PASS | PASS | PASS | PASS | N/A | PASS | PASS |
| Register | `src/app/(auth)/register/page.tsx` | data-security-engineer | PASS | FAIL (checkbox) | PASS | PASS | N/A | PASS | PASS |
| Auth Error | `src/app/auth/error/page.tsx` | data-security-engineer | PASS | PASS | N/A | N/A | PASS | PASS | MINOR |
| Onboarding | `src/app/(dashboard)/onboarding/page.tsx` | data-security-engineer | PASS | PASS | PASS | PASS | N/A | PASS | PASS |
| Join Invitation | `src/app/(auth)/join/[token]/page.tsx` | data-security-engineer | PASS | PASS | PASS | PASS | PASS | PASS | MINOR |
| Dashboard | `src/app/(dashboard)/page.tsx` | mobile-ui-engineer | PASS | PASS | N/A | N/A | N/A | PASS | PASS |

Legend: PASS = no issues, FAIL = P0/P1 issue, MINOR = P3 only, N/A = not applicable

---

## Ownership Boundary Note

All issues found below are in files owned by **data-security-engineer** per `docs/coordination/OWNERSHIP.md`. The mobile-ui-engineer's owned paths (`src/components/ui/**`, `src/components/layout/**`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`, etc.) all pass review with zero issues.

The mobile-ui-engineer cannot apply fixes to files owned by another agent per the collaboration rules and boundary enforcement hooks. The fixes listed below must be applied by data-security-engineer.

---

## P1 Issues

### 1. Register: acceptTerms checkbox below minimum touch target
- **Severity**: P1
- **File**: `src/app/(auth)/register/page.tsx:182-183`
- **Owner**: data-security-engineer
- **Problem**: Checkbox has `h-5 w-5` (20x20px), below the required 44x44px touch target and below WCAG 2.2 AA minimum of 24x24px. While `htmlFor`/`id` association allows label-click activation, the checkbox element itself is too small for direct touch.
- **Fix**: Increase checkbox to `h-6 w-6` (24px) and add `min-h-[44px]` to the wrapper div for adequate touch area. Change `className="flex items-start gap-3"` to `className="flex items-start gap-3 min-h-[44px]"` and `className="mt-1 h-5 w-5"` to `className="mt-1 h-6 w-6"`.

---

## P2 Issues

### 2. Register: Non-functional "服务条款" and "隐私政策" spans
- **Severity**: P2
- **File**: `src/app/(auth)/register/page.tsx:189-191`
- **Owner**: data-security-engineer
- **Problem**: Spans styled with `text-primary underline cursor-pointer` appear clickable but have no `onClick`, `role`, `tabIndex`, or `href`. Creates false affordance (users may try to tap them expecting content).
- **Fix**: Remove `cursor-pointer` class from both spans. Terms/privacy pages do not exist yet in Phase 1-B2. Keep underline styling for visual indication these are legal reference items. When actual pages are available, replace spans with proper `<Link>` components.

### 3. Onboarding: Non-functional "服务条款" and "隐私政策" spans
- **Severity**: P2
- **File**: `src/app/(dashboard)/onboarding/page.tsx:97-99`
- **Owner**: data-security-engineer
- **Problem**: Same as Register page (Issue 2) - span elements styled as clickable but non-functional.
- **Fix**: Remove `cursor-pointer` class from both spans.

### 4. Login: Redundant flex wrapper duplicates AuthLayout
- **Severity**: P2
- **File**: `src/app/(auth)/login/page.tsx:7`
- **Owner**: data-security-engineer
- **Problem**: Login page renders `<div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">` which is identical to the wrapping `src/app/(auth)/layout.tsx:3`. Results in double-padding (32px on each side instead of 16px). At 320px viewport, this reduces available content width from 288px to 256px. Not visually broken but wastes horizontal space on narrow viewports.
- **Fix**: Remove the outer wrapper div from login/page.tsx (lines 7-17, keeping only the Suspense children). AuthLayout already provides the centering and padding. The fixed login/page.tsx should be:

```tsx
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
```

### 5. Register: Submit button enabled when acceptTerms unchecked
- **Severity**: P2
- **File**: `src/app/(auth)/register/page.tsx:213`
- **Owner**: data-security-engineer
- **Problem**: Disabled condition `disabled={isPending || !formValues.email || !formValues.password || !formValues.confirmPassword}` omits `!formValues.acceptTerms`. Button appears visually active before terms checkbox is ticked. Server-side Zod validation catches this and returns an error, but the UX is confusing (enabled button that always fails validation).
- **Fix**: Change the disabled condition on line 213 to:
```
disabled={isPending || !formValues.email || !formValues.password || !formValues.confirmPassword || !formValues.acceptTerms}
```

---

## P3 Issues

### 6. Multiple pages: Decorative SVGs missing `aria-hidden="true"`
- **Severity**: P3
- **Owner**: data-security-engineer
- **Files and Fixes**:
  - `src/app/auth/error/page.tsx:12`: Add `aria-hidden="true"` to the `<svg>` element (X icon, lines 12-24).
  - `src/app/(auth)/register/page.tsx:39`: Add `aria-hidden="true"` to the `<svg>` element (checkmark icon, lines 39-47, inside success state).
  - `src/app/(auth)/join/[token]/page.tsx:44`: Add `aria-hidden="true"` to both `<svg>` elements (user-plus icons at lines 44-55 for unauthenticated view and lines 91-103 for authenticated view).
- **Problem**: Decorative SVG icons are exposed to screen readers, adding noise to the accessibility tree.

### 7. Auth Error page: Static error message without role="alert"
- **Severity**: P3
- **File**: `src/app/auth/error/page.tsx:28-30`
- **Owner**: data-security-engineer
- **Problem**: The main error message paragraph (`<p className="text-sm text-muted-foreground mt-2">`) is static content on a dedicated error page. Adding `role="alert"` ensures screen readers prioritize this content.
- **Fix**: Add `role="alert"` to the paragraph at line 28.

---

## Items Verified as PASS

### Token & Security (P0)
- Join page (`src/app/(auth)/join/[token]/page.tsx`):
  - **Unauthenticated path**: Shows generic message ("收到工作区邀请 ... 请登录后查看并接受邀请"); does NOT reveal workspace name, inviter email, or token validity. No differentiated response for valid/invalid tokens.
  - **Authenticated path**: Token passed via hidden `<input type="hidden">` inside `AcceptInviteForm`. Token value never displayed as raw text on page.
  - AcceptInviteForm (`src/features/auth/accept-invite-form.tsx`): Token in hidden input, not rendered as visible content. Accept is a POST action not automatic on load.
  - No internal error details exposed: error messages are generic.
  - **No P0 security issues found.**

### Chinese Text (P1)
- `grep` for `\uXXXX` escapes returned zero results in `src/app` and `src/features`. All Chinese text uses actual UTF-8 characters.

### Layout at 320px
- All 6 pages render without horizontal overflow at 320px width.
- Auth pages use `max-w-md w-full` constrained by `p-4`, yielding 256-288px content width.
- Dashboard uses `max-w-4xl` with `p-4`, grid collapses to single column.
- Inputs use `w-full` with adequate `px-3` padding.

### Safe Area (mobile-ui-engineer owned)
- `AppShell` (`src/components/layout/app-shell.tsx`): `min-h-dvh` (not vh), `pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]`
- `MobileBottomNav` (`src/components/layout/mobile-bottom-nav.tsx`): `pb-[env(safe-area-inset-bottom,0px)]`
- `DesktopSidebar` (`src/components/layout/desktop-sidebar.tsx`): `pt-[env(safe-area-inset-top,0px)]`
- `TopBar` (`src/components/layout/top-bar.tsx`): `pt-[env(safe-area-inset-top,0px)]`
- `globals.css`: `min-height: 100dvh` on body
- All Safe Area requirements met.

### Touch Targets (other pages)
- All form inputs: `h-11` (44px)
- All submit buttons: `h-11` (44px)
- Password toggle buttons: `min-h-[44px] min-w-[44px]`
- Bottom nav items: `min-h-[44px] min-w-[44px]`
- Desktop sidebar links: `min-h-[44px]`
- Error/retry state buttons: `min-h-[44px] min-w-[44px]`

### Forms
- All labels use correct `htmlFor`/`id` associations
- All error messages use `role="alert"`
- Email inputs use `type="email"` and `inputMode="email"`
- Password inputs use `type="password"` with `autoComplete` (`current-password` or `new-password`)
- Password toggle buttons have `type="button"` and `aria-label`
- Loading states use `Loader2` spinner
- Buttons disabled during submission with `disabled` attribute
- Error states within form flow (no layout shift from errors)

### Accessibility
- Focus visible: All interactive elements have `focus-visible:ring-2 focus-visible:ring-ring` outlines
- Colors not sole error indicator: Errors combine `text-destructive` color with text content and `role="alert"`
- Contrast: Uses shadcn/ui design tokens (semantic colors), not hardcoded magic values

### Mobile-UI-Engineer Owned Files (all PASS)
- `src/components/ui/empty-state.tsx` - PASS
- `src/components/ui/error-state.tsx` - PASS (44px buttons, role="alert", focus ring)
- `src/components/ui/loading-state.tsx` - PASS (role="status", aria-label)
- `src/components/ui/retry-state.tsx` - PASS (44px buttons, role="alert", focus ring)
- `src/components/ui/submitting-state.tsx` - PASS (role="status", aria-label)
- `src/components/ui/responsive-overlay.tsx` - PASS (mobile Drawer, desktop Dialog)
- `src/components/layout/app-shell.tsx` - PASS (dvh, safe area)
- `src/components/layout/mobile-bottom-nav.tsx` - PASS (safe area, 44px targets, focus rings)
- `src/components/layout/desktop-sidebar.tsx` - PASS (safe area, 44px targets, focus rings)
- `src/components/layout/top-bar.tsx` - PASS (safe area)
- `src/hooks/use-responsive.ts` - PASS
- `src/app/layout.tsx` - PASS (html lang="zh-CN")
- `src/app/(dashboard)/layout.tsx` - PASS (auth guard, AppShell)
- `src/app/(dashboard)/page.tsx` - PASS (dashboard placeholder)
- `src/app/globals.css` - PASS (dvh, Chinese font stack)
