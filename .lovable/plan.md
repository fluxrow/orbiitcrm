

# Fix: RLS policy missing for signature image upload

## Problem
The upload in `UserProfileDialog` uses `supabase.storage.upload(..., { upsert: true })`, which requires both INSERT and UPDATE policies on `storage.objects`. The INSERT policy exists but UPDATE is missing, causing the "new row violates row-level security policy" error.

## Solution
Add a single UPDATE RLS policy on `storage.objects` for authenticated users on the `orbit-media` bucket:

```sql
CREATE POLICY "Authenticated can update orbit media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'orbit-media')
WITH CHECK (bucket_id = 'orbit-media');
```

## Files modified
- 1 database migration only

