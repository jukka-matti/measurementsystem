# Deployment Requirements Guide

## Overview

This document outlines all requirements and steps needed to deploy the Measurement System with the latest security improvements. Follow this guide step-by-step to ensure a successful deployment.

## Prerequisites

- Supabase account and project
- Vercel account (for frontend)
- Supabase CLI installed (`npm install -g supabase`)
- Access to Supabase Dashboard
- Git repository access

## Step 1: Database Migration (CRITICAL - Do First!)

The new security migration **must** be applied before deploying Edge Functions. This migration adds org membership validation to all database functions.

### Option A: Using Supabase CLI (Recommended)

```bash
# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

### Option B: Manual Application

1. Open Supabase Dashboard > SQL Editor
2. Copy contents of `supabase/migrations/002_add_org_validation_to_functions.sql`
3. Paste into SQL Editor
4. Click "Run"

### Verify Migration Applied

```sql
-- Check that helper function exists
SELECT proname FROM pg_proc WHERE proname = 'check_user_org_membership';

-- Should return: check_user_org_membership
```

## Step 2: Configure Edge Function Environment Variables

Edge Functions require several environment variables (secrets) to be set in Supabase.

### Required Secrets

Set these in **Supabase Dashboard > Project Settings > Edge Functions > Secrets**:

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (from API settings) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_ANON_KEY` | Anon/public key (from API settings) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:3000,https://your-app.vercel.app` |

### Optional Secrets

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Controls error message detail | `development` (shows detailed errors) |

**Recommendation**: Set `ENVIRONMENT=production` in production to hide internal error details from users.

### Setting Secrets via CLI

```bash
# Required secrets
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
supabase secrets set SUPABASE_ANON_KEY=your-anon-key-here
supabase secrets set ALLOWED_ORIGINS="http://localhost:3000,https://your-app.vercel.app"

# Optional (recommended for production)
supabase secrets set ENVIRONMENT=production
```

### Setting Secrets via Dashboard

1. Go to **Supabase Dashboard > Project Settings > Edge Functions**
2. Click **"Secrets"** tab
3. Click **"Add a new secret"**
4. Enter variable name and value
5. Click **"Save"**
6. Repeat for each secret

### Finding Your Keys

**Project URL and Keys:**
1. Go to **Supabase Dashboard > Settings > API**
2. Copy:
   - **Project URL** → Use for `SUPABASE_URL`
   - **anon public** key → Use for `SUPABASE_ANON_KEY`
   - **service_role** key → Use for `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

## Step 3: Deploy Edge Functions

Deploy all updated Edge Functions. The shared utilities (`_shared/` folder) are automatically included.

### Deploy All Functions

```bash
# Deploy each function
supabase functions deploy ingest_event
supabase functions deploy bulk_ingest
supabase functions deploy export_csv
supabase functions deploy blocker
supabase functions deploy create_next_unit
```

### Verify Deployment

After deployment, check function logs:

```bash
# View logs for a function
supabase functions logs ingest_event

# Or check in Dashboard: Edge Functions > ingest_event > Logs
```

## Step 4: Frontend Deployment (Vercel)

The frontend deployment requirements remain unchanged.

### Environment Variables (Vercel)

Set these in **Vercel Dashboard > Project Settings > Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important:**
- Set for all environments: Production, Preview, Development
- Never commit service_role key to frontend code
- Redeploy after adding/changing environment variables

### Deploy Frontend

1. Push changes to your repository
2. Vercel will automatically deploy (if auto-deploy is enabled)
3. Or manually trigger: **Vercel Dashboard > Deployments > Redeploy**

## Step 5: Post-Deployment Verification

### 1. Test Authentication

Test that Edge Functions authenticate correctly:

```bash
# Get a JWT token (from your frontend after login)
# Then test an Edge Function:
curl -X POST https://your-project.supabase.co/functions/v1/ingest_event \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unit_id": "valid-unit-id",
    "order_id": "valid-order-id",
    "stage": "order_info",
    "type": "stage_start",
    "ts_device": "2025-01-01T00:00:00Z"
  }'
```

**Expected**: Should return success or validation error (not authentication error).

### 2. Test Rate Limiting

Make 101 rapid requests to any Edge Function. The 101st request should return:

```json
{
  "error": "Rate limit exceeded: 100 requests per minute",
  "code": "RATE_LIMIT_EXCEEDED",
  "status": 429
}
```

### 3. Test CORS

From browser console on your frontend:

```javascript
fetch('https://your-project.supabase.co/functions/v1/ingest_event', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    unit_id: 'test',
    order_id: 'test',
    stage: 'order_info',
    type: 'stage_start',
    ts_device: new Date().toISOString()
  })
})
.then(r => r.json())
.then(console.log)
```

**Expected**: Should not show CORS errors in console.

### 4. Test Database Function Security

Verify org validation works:

```sql
-- This should fail if user doesn't belong to org
-- (Replace with a different org_id than user belongs to)
SELECT * FROM get_wip_by_stage('some-other-org-id');
```

**Expected**: Error: "Access denied: User does not belong to this organization"

### 5. Check Audit Logs

Monitor Supabase Dashboard > Logs > Edge Functions for audit log entries. You should see JSON logs for:
- Event creation
- CSV exports
- Blocker recording
- Unit creation

## Troubleshooting

### Error: "Missing required Supabase environment variables"

**Cause**: Edge Function secrets not set.

**Fix**: 
1. Verify secrets are set: `supabase secrets list`
2. Set missing secrets (see Step 2)
3. Redeploy affected functions

### Error: "Access denied: User does not belong to this organization"

**Cause**: Database function security validation working correctly.

**Fix**: 
- This is expected behavior - security is working!
- Ensure user is added to `org_members` table with correct `org_id`
- Verify user's JWT token contains correct user ID

### Error: "Rate limit exceeded"

**Cause**: Rate limiting is working (100 requests/minute per user).

**Fix**: 
- Wait 1 minute for rate limit to reset
- Or adjust rate limit in `supabase/functions/_shared/rate-limit.ts` if needed
- For production with multiple instances, consider Redis-based rate limiting

### CORS Errors in Browser

**Cause**: Frontend origin not in `ALLOWED_ORIGINS`.

**Fix**: 
1. Check current `ALLOWED_ORIGINS`: `supabase secrets list`
2. Add your production domain:
   ```bash
   supabase secrets set ALLOWED_ORIGINS="http://localhost:3000,https://your-app.vercel.app"
   ```
3. Redeploy all Edge Functions

### Functions Can't Find Shared Utilities

**Cause**: Functions deployed from wrong directory or `_shared/` folder missing.

**Fix**: 
1. Ensure `supabase/functions/_shared/` folder exists
2. Deploy from project root: `supabase functions deploy function-name`
3. Supabase automatically includes `_shared/` when deploying

### Database Function Errors After Migration

**Cause**: Migration not applied or applied incorrectly.

**Fix**: 
1. Verify migration applied:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'check_user_org_membership';
   ```
2. If missing, re-apply migration (Step 1)
3. Check function definitions match migration file

## Environment Variables Summary

### Vercel (Frontend)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### Supabase Edge Functions (Backend)

```bash
# Required
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.vercel.app

# Optional (recommended for production)
ENVIRONMENT=production
```

## Deployment Checklist

Use this checklist to ensure nothing is missed:

- [ ] Database migration `002_add_org_validation_to_functions.sql` applied
- [ ] Edge Function secret `SUPABASE_URL` set
- [ ] Edge Function secret `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] Edge Function secret `SUPABASE_ANON_KEY` set
- [ ] Edge Function secret `ALLOWED_ORIGINS` set with production domain(s)
- [ ] Edge Function secret `ENVIRONMENT=production` set (optional but recommended)
- [ ] All 5 Edge Functions deployed:
  - [ ] `ingest_event`
  - [ ] `bulk_ingest`
  - [ ] `export_csv`
  - [ ] `blocker`
  - [ ] `create_next_unit`
- [ ] Vercel environment variables set:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Frontend deployed to Vercel
- [ ] Authentication tested
- [ ] Rate limiting verified
- [ ] CORS headers verified
- [ ] Database function security tested
- [ ] Audit logs checked

## Quick Reference Commands

```bash
# Link project
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push

# Set secrets
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx
supabase secrets set SUPABASE_ANON_KEY=xxx
supabase secrets set ALLOWED_ORIGINS="http://localhost:3000,https://your-app.vercel.app"
supabase secrets set ENVIRONMENT=production

# List secrets (verify)
supabase secrets list

# Deploy functions
supabase functions deploy ingest_event
supabase functions deploy bulk_ingest
supabase functions deploy export_csv
supabase functions deploy blocker
supabase functions deploy create_next_unit

# View logs
supabase functions logs ingest_event
```

## Important Notes

1. **Migration Order**: Always apply database migration BEFORE deploying Edge Functions
2. **Secrets**: Edge Function secrets are separate from Vercel environment variables
3. **CORS**: Configure via `ALLOWED_ORIGINS` environment variable (no code changes needed)
4. **Rate Limiting**: Currently uses in-memory store. For multi-instance deployments, consider Redis
5. **Audit Logging**: Currently logs to console. Consider creating `audit_logs` table for production
6. **Error Messages**: Set `ENVIRONMENT=production` to hide detailed errors from users
7. **Shared Utilities**: Automatically included when deploying functions - no manual configuration needed

## Support

If you encounter issues not covered in this guide:

1. Check Supabase Dashboard > Logs > Edge Functions for error details
2. Verify all environment variables are set correctly
3. Ensure database migration is applied
4. Review function logs: `supabase functions logs function-name`

## Related Documentation

- [Deployment Guide](DEPLOYMENT.md) - General deployment instructions
- [Architecture Documentation](ARCHITECTURE.md) - System architecture details
- [API Documentation](API.md) - API endpoint documentation

