# 🔐 Security Audit — Atlas Polskich Ptaków

**Date:** 2026-03-23  
**Auditor:** Aragosta (OpenClaw Security Subagent)  
**Scope:** Frontend (index.html), Supabase Edge Functions, DB migrations, birds.json  
**Verdict:** ⚠️ **NOT SAFE TO RELEASE AS-IS** — critical issues must be resolved first

---

## 🔴 CRITICAL — Block Release

### C1. No rate limiting on any Edge Function
**Affected:** All 5 functions: `bird-describe`, `bird-tts`, `bird-sound`, `bird-photo`, `bird-description`

None of the Edge Functions implement any form of rate limiting. Since `SUPABASE_ANON_KEY` is public (intentionally, by Supabase design) and CORS is `*`, any person on the internet can call:
- `bird-describe` → fires OpenAI GPT API call (paid)
- `bird-tts` → fires ElevenLabs TTS API call (paid, charged per character)
- `bird-sound` → fires Xeno-canto API call (quota)

A simple loop script can drain the entire OpenAI and ElevenLabs budget in minutes. Caching helps only for already-seen bird+audience combos (96 birds × 3 audiences = 288 combos); for anything not yet cached it's fully open.

**Fix required:**
- Add rate limiting per IP using Supabase's built-in `ip_address` or a Redis/Upstash counter
- Or: set a hard budget cap in OpenAI/ElevenLabs dashboards with alerts
- Or: require an auth token / signed request from your own domain (Referer check + secret header)
- Minimum: set `spend_limit` in OpenAI and ElevenLabs to a safe monthly cap NOW

---

### C2. RLS policies allow anon key to WRITE to all tables
**Affected:** `bird_content`, `bird_audio`, `bird_descriptions` migrations

The write policies are named `service_write` but they use `USING (true)` and `WITH CHECK (true)` without restricting to `service_role`. This means anyone with the public anon key can INSERT, UPDATE, and DELETE cached descriptions and audio:

```sql
-- CURRENT (WRONG) — allows anon to write:
CREATE POLICY "service_write" ON public.bird_content FOR ALL USING (true);

-- SHOULD BE:
CREATE POLICY "service_write" ON public.bird_content
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

An attacker can replace all cached bird descriptions with malicious content or spam, fill the DB with junk, or delete the cache to force repeated API calls (amplifying C1).

**Fix required — new migration:**
```sql
-- bird_content
DROP POLICY "service_write" ON public.bird_content;
CREATE POLICY "service_write" ON public.bird_content
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- bird_audio
DROP POLICY "service_write_audio" ON public.bird_audio;
CREATE POLICY "service_write_audio" ON public.bird_audio
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- bird_descriptions
DROP POLICY "service_insert" ON public.bird_descriptions;
CREATE POLICY "service_insert" ON public.bird_descriptions
  FOR INSERT TO service_role WITH CHECK (true);
```

---

## 🟠 HIGH — Fix Before Release

### H1. No input validation or length limits in Edge Functions

**`bird-tts`:** The `text` parameter has no length limit. An attacker can send 50,000 characters and rack up ElevenLabs charges. The `birdName` field is also unsanitized.

**`bird-describe`:** `birdName`, `latinName`, and `audience` are passed without validation. The `audience` value is used as a dictionary key but not validated against allowed values (`przedszkolak`, `szkolny`, `dorosly`). An invalid audience falls through to `dorosly` silently.

**`bird-sound` / `bird-photo`:** `latinName` is passed to external API URLs. Although `encodeURIComponent` is used for URL construction, there are no checks for empty, null, or excessively long values.

**Fix required:**
```typescript
// bird-tts — add at start of handler:
if (!text || text.length > 2000) {
  return new Response(JSON.stringify({ error: 'text too long or missing' }), { status: 400, headers: cors });
}
if (!birdName || birdName.length > 100) {
  return new Response(JSON.stringify({ error: 'invalid birdName' }), { status: 400, headers: cors });
}

// bird-describe — validate audience:
const VALID_AUDIENCES = ['przedszkolak', 'szkolny', 'dorosly'];
if (!VALID_AUDIENCES.includes(audience)) {
  return new Response(JSON.stringify({ error: 'invalid audience' }), { status: 400, headers: cors });
}
```

---

### H2. No JWT authentication on Edge Functions

All 5 functions accept requests from anyone, with no verification that the caller is legitimate. While Supabase anon key is public by design, the functions should at minimum verify a valid JWT is present (even if just the anon JWT) to prevent trivial unauthenticated abuse from curl/scripts.

Supabase Edge Functions can enforce JWT verification via the `Authorization` header. Currently the functions **receive** the header but **never check it**.

**Fix (per function, at start of handler):**
```typescript
const authHeader = req.headers.get('Authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
}
// Optionally verify the JWT using Supabase createClient or a JWKS check
```

This is a lightweight first layer of defense against non-browser automation.

---

### H3. CORS wildcard (`*`) on all Edge Functions

All functions set `'Access-Control-Allow-Origin': '*'`. This allows any website in the world to call your functions using user browsers (CSRF-like), burning your API budget.

**Fix:** Restrict to your actual domains:
```typescript
const ALLOWED_ORIGINS = ['https://atlas-ptakow.vercel.app', 'http://localhost:3000'];
const origin = req.headers.get('Origin') || '';
const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

const cors = {
  'Access-Control-Allow-Origin': corsOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

---

## 🟡 MEDIUM — Fix Soon

### M1. `bird-describe`, `bird-sound`, `bird-photo` lack try/catch

Only `bird-tts` has a try/catch. The other three functions will return unhandled Deno errors on bad input or upstream API failures, potentially leaking internal function paths, Supabase URLs, or stack traces.

**Fix:** Wrap the entire handler body in try/catch for all functions.

---

### M2. SUPABASE_ANON_KEY hardcoded 5 times in index.html

The key appears as a literal string in 5 different places (`loadBirdPhoto`, `playSound`, `speakWithElevenLabs`, `loadModalPhotos`, `loadAudienceDesc`, `speakModalAudienceDesc`). This is not a security risk per se (the anon key is designed to be public), but it's a maintenance hazard — if you rotate the key, you'll need to update all 5 copies and risk missing one.

**Fix:** Define once at the top (as is done with `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the top of the script) and reference the variable everywhere. The two inner functions that redefine `const ANON_KEY = ...` locally should use the top-level constant instead.

---

### M3. Error messages leak internal details in `bird-tts`

When ElevenLabs call fails, the response includes `{ error: e.message }`. `e.message` can contain the ElevenLabs API endpoint URL or response details. Not a direct key leak (keys are env vars), but reveals implementation.

**Fix:** Return generic error messages to clients; log details server-side only.

---

### M4. `bird_content.audience` CHECK constraint bypassed by `sound` and `photo` audiences

The migration defines:
```sql
CHECK (audience IN ('przedszkolak', 'szkolny', 'dorosly'))
```

But `bird-sound` and `bird-photo` insert rows with `audience = 'sound'` and `audience = 'photo'` respectively. This means the constraint is violated or was silently dropped. Either the constraint isn't enforced (DB inconsistency) or inserts fail silently.

**Fix:** Update the constraint to include all valid audience values used by the codebase:
```sql
CHECK (audience IN ('przedszkolak', 'szkolny', 'dorosly', 'sound', 'photo'))
```

---

## 🟢 LOW — Nice to Have

### L1. No SRI (Subresource Integrity) on Google Fonts

```html
<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet" />
```

If Google Fonts CDN were compromised (extremely unlikely), no integrity check would catch it. SRI is standard practice for external resources.

### L2. `bird.name` / `bird.emoji` injected via `innerHTML` in `renderCards()`

Values from `birds.json` (developer-controlled) are injected with `innerHTML` in card rendering. This is currently safe since the data source is internal, but if the data source ever becomes user-editable, this becomes an XSS vector. Using `textContent` or DOM manipulation is safer long-term.

### L3. Error object message returned to user in TTS audio player

```javascript
if (player) player.innerHTML = '<div style="color:red">Błąd: ' + e.message + '</div>';
```

`e.message` is injected into innerHTML. If an attacker can craft an error message containing HTML/JS (uncommon but possible with crafted responses), this is an XSS vector. Sanitize with `textContent` instead.

### L4. Vercel project ID in `.vercel/project.json`

`projectId` and `orgId` are committed. Not a direct security risk (can't do much without auth tokens), but represents unnecessary exposure. Consider adding `.vercel/` to `.gitignore` — the README.txt in that folder actually recommends this.

### L5. `supabase/.temp/` contains local dev metadata

Files like `project-ref`, `pooler-url`, etc. are in the repo. These reference your live Supabase project. Not secrets, but unnecessary exposure. Add to `.gitignore`.

---

## 📋 Summary Table

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| C1 | 🔴 CRITICAL | No rate limiting on Edge Functions | Must fix |
| C2 | 🔴 CRITICAL | RLS allows anon to write/delete cached data | Must fix |
| H1 | 🟠 HIGH | No input validation / length limits | Fix before release |
| H2 | 🟠 HIGH | No JWT verification in Edge Functions | Fix before release |
| H3 | 🟠 HIGH | CORS wildcard `*` on all functions | Fix before release |
| M1 | 🟡 MEDIUM | Missing try/catch in 3 of 5 functions | Fix soon |
| M2 | 🟡 MEDIUM | Anon key defined 5x redundantly in frontend | Fix soon |
| M3 | 🟡 MEDIUM | Error messages leak impl details | Fix soon |
| M4 | 🟡 MEDIUM | DB constraint inconsistency for audience values | Fix soon |
| L1 | 🟢 LOW | No SRI on Google Fonts | Nice to have |
| L2 | 🟢 LOW | bird.name in innerHTML (dev-controlled) | Nice to have |
| L3 | 🟢 LOW | e.message injected into innerHTML | Nice to have |
| L4 | 🟢 LOW | .vercel/project.json committed | Nice to have |
| L5 | 🟢 LOW | supabase/.temp/ committed | Nice to have |

---

## ✅ What's Already Good

- **API keys are server-side only** — OPENAI_API_KEY, ELEVENLABS_API_KEY, XENOCANTO_API_KEY, SUPABASE_SERVICE_ROLE_KEY are all accessed via `Deno.env.get()` and never exposed to the browser. ✓
- **SUPABASE_ANON_KEY exposure is by design** — Supabase anon keys are meant to be public. The real risk is what the anon role can do, which is addressed in C2. ✓
- **`.env.local` is gitignored** — not committed to the repo. ✓
- **RLS is enabled on all tables** — none left without row-level security. ✓
- **birds.json contains no sensitive data** — only public ornithological data. ✓
- **XSS via search input is not possible** — user search input is never injected into DOM. ✓
- **Caching reduces API calls** — the DB cache means repeated lookups don't hit paid APIs. ✓

---

## 🚦 VERDICT

**⛔ NOT SAFE TO RELEASE** in current state.

**Minimum required before going public:**

1. **Fix RLS** (C2) — new migration, 15 minutes of work. Without this, anyone can corrupt or delete your bird description cache.
2. **Add spend limits** in OpenAI + ElevenLabs dashboards (C1) — do this in 5 minutes, right now, as a safety net even before writing code.
3. **Add input validation + text length limits** to `bird-tts` and `bird-describe` (H1) — prevents cost amplification attacks.
4. **Restrict CORS** to your actual domain (H3) — prevents third-party sites from burning your budget via user browsers.

Once those 4 items are done, the app is **conditionally safe to release as a low-traffic educational project** with monitoring enabled.

The rate limiting (C1 full fix) and JWT verification (H2) are important but can be implemented incrementally post-launch if budget caps are set first.
