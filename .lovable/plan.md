
# Fix: OrbitTaskDialog crash on open

## Root Cause

The `OrbitTaskDialog` crashes with the error: **"A `<Select.Item />` must have a value prop that is not an empty string"**. This is on line 138 of `OrbitTaskDialog.tsx`:

```tsx
<SelectItem value="">Nenhum</SelectItem>
```

Radix UI Select forbids empty string values because empty string is used internally to clear the selection.

## Fix

**File: `src/components/orbit/OrbitTaskDialog.tsx`**

1. Change `<SelectItem value="">Nenhum</SelectItem>` to `<SelectItem value="none">Nenhum</SelectItem>`
2. Update the `prospectId` state initialization: default to `"none"` instead of `""`
3. In `handleSubmit`, treat `"none"` as no prospect: `prospect_id: prospectId && prospectId !== "none" ? prospectId : undefined`
4. In the `useEffect` reset, use `"none"` instead of `""` for the fallback

This is a single-file, 4-line fix.
