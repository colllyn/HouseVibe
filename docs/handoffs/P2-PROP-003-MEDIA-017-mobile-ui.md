# P2-PROP-003-MEDIA-017 — Mobile UI Handoff

**Handoff from**: mobile-ui-engineer
**To**: property-crm-engineer
**Date**: 2026-08-02
**Status**: Ready for integration

---

## Summary

Created two media management client components under `src/components/ui/`:

1. **`MediaUploader`** (`src/components/ui/media-uploader.tsx`) — Drag-and-drop image upload with per-file progress
2. **`MediaGrid`** (`src/components/ui/media-grid.tsx`) — Responsive grid display, sort, cover toggle, delete
3. **`CoverImage`** — Exported from `media-grid.tsx`; hero cover image for detail pages

These components call the API endpoints defined in `docs/contracts/property-media-contract.md` (FROZEN v1.0).

## Why `src/components/ui/` instead of `src/features/properties/components/`

The agent boundary hook (`docs/coordination/OWNERSHIP.md`) prevents mobile-ui-engineer from writing to `src/features/properties/**` or `src/app/(dashboard)/properties/**`. The components are placed in `src/components/ui/` (which is mobile-ui-engineer's owned path). The property-crm-engineer can either:
- Keep them there and import from `@/components/ui/media-grid` etc.
- Move them to `src/features/properties/components/` and update the import paths

## Files Created

| File | Path | Description |
|------|------|-------------|
| MediaUploader | `src/components/ui/media-uploader.tsx` | Upload component with DnD, file validation, progress |
| MediaGrid + CoverImage | `src/components/ui/media-grid.tsx` | Grid display, sorting, cover, delete, full-size viewer |

## Components API Reference

### `MediaUploader`

```tsx
import { MediaUploader } from "@/components/ui/media-uploader";

<MediaUploader
  propertyId="<uuid>"        // required
  onSuccess={() => {}}       // optional: called when at least one file uploads successfully
  className="..."            // optional
/>
```

**Features**:
- File input: accepts `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- Drag-and-drop zone with visual feedback
- Max 5 files at once, max 10 MB per file (validated client-side)
- Preview thumbnails before upload (`URL.createObjectURL`, cleaned up on unmount)
- Per-file upload via `XMLHttpRequest` for progress tracking (uploads sequentially)
- Per-file progress bar, success indicator, error display with retry
- Remove button per file (except when uploading)
- "清除已完成" button to clear successful/errored files
- 44px minimum touch targets
- Works at 320px width (no horizontal scroll)
- Keyboard accessible (Enter/Space to open file picker)
- Uses `credentials: "include"` for auth cookies

**POST endpoint**: `/api/properties/{propertyId}/media` (multipart/form-data, field: `files`)

**States covered**: idle, uploading, per-file success, per-file error with retry, global validation errors (too many files, unsupported format, file too large)

### `MediaGrid`

```tsx
import { MediaGrid } from "@/components/ui/media-grid";

<MediaGrid
  propertyId="<uuid>"        // required
  refreshKey={0}             // optional: increment to trigger re-fetch (e.g., after upload)
  listElt="section"          // optional: wrapper element, "section" (default) or "div"
  className="..."            // optional
/>
```

**Features**:
- Responsive grid: `grid-cols-2` (mobile), `sm:grid-cols-3` (tablet), `lg:grid-cols-4` (desktop)
- Lazy-loaded thumbnails from signed URLs
- Image error fallback (shows Image icon if signed URL is expired/broken)
- Cover badge on the cover image (yellow star + "封面" label)
- Sort controls: up/down arrows per image (calls PATCH for sortOrder)
- Set as cover: star button per image (filled when isCover, calls PATCH)
- Delete with `ConfirmDialog` (uses `ResponsiveOverlay`: Drawer on mobile, Dialog on desktop)
- Click image to view large in a centered `Dialog`
- 44px minimum touch targets on all action buttons
- Works at 320px width (2-column grid with padding)

**API calls**:
- `GET /api/properties/{propertyId}/media` — fetch list
- `PATCH /api/properties/{propertyId}/media/{mediaId}` — sortOrder, isCover
- `DELETE /api/properties/{propertyId}/media/{mediaId}` — soft delete

**States covered**: loading (skeleton grid with 4 animated placeholders), empty (Upload icon + "暂无图片" + "点击上方上传"), error (AlertTriangle + description + retry button), success (full grid)

**Refresh trigger**: When parent increments `refreshKey`, the grid re-fetches. Use this after upload success.

### `CoverImage`

```tsx
import { CoverImage } from "@/components/ui/media-grid";

<CoverImage
  propertyId="<uuid>"        // required
  className="..."            // optional
/>
```

**Features**:
- `aspect-video` container
- Shows the first `isCover=true` image, or first image if no cover set
- Falls back to Image icon placeholder if no media
- Handles loading, error, and empty states
- Used as hero image replacement on property detail page

## Integration Guide: Update Property Pages

### 1. Property Detail Page (`src/app/(dashboard)/properties/[propertyId]/page.tsx`)

**Current state** (line 47):
```tsx
{/* Cover */}
<div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-6">
  <Building2 className="h-16 w-16 text-muted-foreground/30" />
</div>
```

**Replace with**:
```tsx
{/* Cover */}
<Suspense fallback={<div className="aspect-video bg-muted rounded-lg mb-6 animate-pulse" />}>
  <CoverImage propertyId={property.id} className="mb-6" />
</Suspense>
```

**Also add MediaGrid section** after the "共享与营销" section (after line 101), before the closing `</div>`:
```tsx
{/* Media Gallery */}
<section className="rounded-lg border mb-6">
  <h2 className="font-semibold text-sm px-4 py-3 border-b">房源图片</h2>
  <div className="px-2 py-3">
    <Suspense fallback={<div className="p-4"><MediaGridSkeleton /></div>}>
      <MediaGrid propertyId={property.id} />
    </Suspense>
  </div>
</section>
```

Then export `MediaGridSkeleton` from `media-grid.tsx` or use a fallback div.

**Import additions**:
```tsx
import { CoverImage, MediaGrid } from "@/components/ui/media-grid";
```

Note: `Building2` can be removed from lucide imports if no longer used elsewhere (but keep it — it's only used on the cover line which is being replaced).

### 2. Property Edit Page (`src/app/(dashboard)/properties/[propertyId]/edit/page.tsx`)

**Add media section** between "设施与共享" (line 251) and "敏感信息" (line 253). Insert after `</section>` on line 251:

```tsx
{/* Media */}
<section className="space-y-4 rounded-lg border p-4">
  <h2 className="font-semibold text-sm">房源图片</h2>
  <MediaUploader
    propertyId={propertyId}
    onSuccess={() => setMediaRefreshKey((k) => k + 1)}
  />
  <MediaGrid
    propertyId={propertyId}
    refreshKey={mediaRefreshKey}
  />
</section>
```

**State addition** (after line 51, alongside other useState calls):
```tsx
const [mediaRefreshKey, setMediaRefreshKey] = React.useState(0);
```

**Import additions**:
```tsx
import { MediaUploader } from "@/components/ui/media-uploader";
import { MediaGrid } from "@/components/ui/media-grid";
```

## Design Compliance

- Mobile-first: core flows tested at 320px (2-column grid, stacked buttons on mobile via `flex-col sm:flex-row`)
- Touch targets: all interactive elements have `min-h-[44px] min-w-[44px]` or equivalent
- Safe area: not applicable here (these are inline components, not fixed-position); the parent layout and bottom nav handle safe-area-inset
- No magic colors: all styling uses Tailwind design tokens (`bg-primary`, `text-destructive`, `text-muted-foreground`, etc.)
- Chinese text: actual UTF-8 characters
- Loading/empty/error/retry states: all covered per component
- shadcn/ui patterns: uses `cn()` from `@/lib/utils`; consistent button patterns; `ConfirmDialog` for delete
- Icons: lucide-react (`Upload`, `Star`, `Trash2`, `ChevronUp`, `ChevronDown`, `X`, `AlertCircle`, `Loader2`, `ImagePlus`, `RefreshCw`, `Maximize2`, `Image`)

## Verification

```bash
# TypeScript
npx tsc --noEmit

# Lint (warnings only, no errors)
npx eslint src/components/ui/media-uploader.tsx src/components/ui/media-grid.tsx

# Build (passes)
npx next build
```

All three pass successfully.

## Deferred / Out of Scope

- The media API routes (`/api/properties/[id]/media/...`) — owned by property-crm-engineer per the contract
- `UpdateMediaInputSchema` in `src/features/properties/schemas.ts` — property-crm-engineer per the contract
- Mobile Drawer for full-size image viewer: currently uses `Dialog` on all breakpoints (the `ConfirmDialog` for delete uses `ResponsiveOverlay`). Could switch full-size viewer to `ResponsiveOverlay` later.
- Video support — deferred per contract
- Bulk reorder (drag-and-drop) — deferred; sequential PATCH supported now

## Risks / Notes

1. **Signed URL expiry**: Images may stop loading after the signed URL expires (default 3600s). The grid re-fetches on `refreshKey` change. For long-lived views, the API could be called again.
2. **API routes not yet built**: The components call endpoints that property-crm-engineer must implement per the contract. Until then, the UI will show error/loading states gracefully.
3. **`Credentials` method**: The components use `credentials: "include"` for fetch calls (consistent with `delete-button.tsx` which uses `credentials: "same-origin"`). The `MediaUploader` uses XHR `withCredentials = true`.
4. **Optimistic sort updates**: The `moveMedia` function updates state optimistically and reverts on failure. Sort ordering works correctly even when items share the same `sortOrder` (tiebreaker is `createdAt`).

## Change Log

| Date | Change |
|------|--------|
| 2026-08-02 | Initial creation of MediaUploader, MediaGrid, CoverImage |
