# Deployment Checklist - Security Improvements

## Critical: Before Deployment

### 1. Database Migration (REQUIRED)
The new security migration **must** be applied before deploying Edge Functions:

```bash
# Option 1: Using Supabase CLI
supabase db push

# Option 2: Manual application
# Copy contents of supabase/migrations/002_add_org_validation_to_functions.sql
# Paste into Supabase Dashboard > SQL Editor > Run
```

**Migration**: `002_add_org_validation_to_functions.sql`
- Adds org membership validation to all SECURITY DEFINER functions
- Prevents users from querying data from orgs they don't belong to

### 2. Edge Functions Environment Variables (REQUIRED)

Each Edge Function needs these environment variables set in Supabase Dashboard:

**Go to**: Supabase Dashboard > Project Settings > Edge Functions > Secrets

Set the following secrets:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
ENVIRONMENT=production  # Optional: for error message detail control
```

**How to set secrets:**
```bash
# Using Supabase CLI
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
supabase secrets set ENVIRONMENT=production
```

**OR** via Dashboard:
1. Go to Supabase Dashboard > Project Settings > Edge Functions
2. Click "Secrets" tab
3. Add each secret variable

### 3. Configure CORS (REQUIRED)

Set the `ALLOWED_ORIGINS` environment variable for Edge Functions:

```bash
# Using Supabase CLI
supabase secrets set ALLOWED_ORIGINS="http://localhost:3000,https://your-project.vercel.app,https://your-custom-domain.com"
```

**OR** via Dashboard:
1. Go to Supabase Dashboard > Project Settings > Edge Functions > Secrets
2. Add secret: `ALLOWED_ORIGINS`
3. Value: Comma-separated list of allowed origins
   - Example: `http://localhost:3000,https://your-project.vercel.app`

**Note**: If not set, defaults to `http://localhost:3000,https://localhost:3000` for development.

### 4. Deploy All Edge Functions (REQUIRED)

Deploy all updated Edge Functions:

```bash
# Deploy all functions
supabase functions deploy ingest_event
supabase functions deploy bulk_ingest
supabase functions deploy export_csv
supabase functions deploy blocker
supabase functions deploy create_next_unit
```

**Note**: The shared utilities (`_shared/` folder) are automatically included when deploying functions.

### 5. Verify Shared Utilities Are Deployed

The Edge Functions now depend on shared utilities. Supabase automatically includes files from `_shared/` when deploying. Verify by checking function logs after deployment.

## Post-Deployment Verification

### 1. Test Authentication
```bash
# Test Edge Function authentication
curl -X POST https://your-project.supabase.co/functions/v1/ingest_event \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"unit_id":"...","order_id":"...","stage":"order_info","type":"stage_start","ts_device":"2025-01-01T00:00:00Z"}'
```

### 2. Test Rate Limiting
Make 101 requests rapidly - the 101st should return 429 status.

### 3. Test CORS
From browser console on your frontend:
```javascript
fetch('https://your-project.supabase.co/functions/v1/ingest_event', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({...})
})
```

### 4. Test Database Functions
Verify org validation works:
```sql
-- This should fail if user doesn't belong to org
SELECT * FROM get_wip_by_stage('some-other-org-id');
```

### 5. Check Audit Logs
Monitor Supabase Dashboard > Logs > Edge Functions for audit log entries.

## Environment Variables Summary

### Vercel (Frontend)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### Supabase Edge Functions (Backend)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.vercel.app  # Required for CORS
ENVIRONMENT=production  # Optional: controls error message detail
```

## Deployment Order

1. ✅ Apply database migration (`002_add_org_validation_to_functions.sql`)
2. ✅ Set Edge Function secrets in Supabase Dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `ALLOWED_ORIGINS` (comma-separated list)
   - `ENVIRONMENT=production` (optional)
3. ✅ Deploy all Edge Functions
4. ✅ Deploy frontend to Vercel (if changed)
5. ✅ Test authentication and authorization
6. ✅ Verify rate limiting works
7. ✅ Check audit logs
8. ✅ Verify CORS headers are set correctly

## Troubleshooting

### Error: "Missing required Supabase environment variables"
- **Fix**: Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY as Edge Function secrets

### Error: "Access denied: User does not belong to this organization"
- **Expected**: This is the new security validation working correctly
- **Fix**: Ensure user is added to `org_members` table with correct `org_id`

### Error: "Rate limit exceeded"
- **Expected**: Rate limiting is working (100 requests/minute)
- **Fix**: Wait 1 minute or adjust rate limit in `rate-limit.ts` if needed

### CORS errors in browser
- **Fix**: Set `ALLOWED_ORIGINS` environment variable with your production domain(s) and redeploy functions

### Functions can't find shared utilities
- **Fix**: Ensure `_shared/` folder exists and functions are deployed from the correct directory
- Supabase automatically includes `_shared/` when deploying from `supabase/functions/`

## Important Notes

1. **Database Migration is Critical**: The new migration adds security validation. Functions will fail if migration isn't applied.

2. **Environment Variables**: Edge Functions need secrets set in Supabase Dashboard, not just in code.

3. **CORS**: Update allowed origins before deploying to production.

4. **Rate Limiting**: Currently uses in-memory store. For multi-instance deployments, consider Redis.

5. **Audit Logging**: Currently logs to console. Consider creating an `audit_logs` table for production.

6. **Error Messages**: Set `ENVIRONMENT=production` to hide detailed error messages from users.

