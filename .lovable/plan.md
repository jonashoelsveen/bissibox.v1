
# Plan: subdirectory surfaces + cookie auth refactor

Before I touch anything, I need to flag conflicts between Part D (HTTP-only cookie auth + server-proxied Supabase) and the existing stack. Parts A, B, C, E, F, G are straightforward. Part D is the risky one.

---

## ⚠️ Conflicts to resolve before I start

### 1. Part D fights the Lovable Cloud auth model (HIGH)

This project uses the managed Lovable Cloud pattern:
- `src/integrations/supabase/client.ts` — auto-generated, persists session in `localStorage`. **The system prompt says "NEVER EVER edit this file."**
- `src/integrations/supabase/auth-middleware.ts` — auto-generated `requireSupabaseAuth` that reads a **Bearer token from the Authorization header**, not a cookie.
- `src/integrations/supabase/auth-attacher.ts` — auto-generated client middleware that pulls `access_token` from `supabase.auth.getSession()` and attaches it to every `createServerFn` call.

The spec asks me to:
- Disable `persistSession` on the client → breaks the auto-generated client and every `supabase.auth.onAuthStateChange` listener in the app (auth context, root cache invalidation, etc.).
- Make the cookie the source of truth → `requireSupabaseAuth` doesn't read cookies, so every existing server function stops working until rewritten.
- Proxy **all** `.from()` / `.rpc()` calls through server functions → this is hundreds of call-sites across calendar, diary, media, team, library, hooks, components. It's not a mechanical migration; many use realtime, joins, and Supabase-specific query builders.

**Proposed resolution (need your OK):**
- **Option B-lite:** Keep the existing Bearer-token model (it already meets "session not in URL, validated server-side, RLS-enforced") and add the cookie **alongside** it as a session-bootstrap mechanism, not a replacement. The `aponna_session` cookie holds the refresh token; on app boot, `/api/auth/session` exchanges it for an access token that the existing `attachSupabaseAuth` middleware uses. No mass migration of `.from()` calls.
- **Or — full Option B:** Estimate 3–5 days of work, will break realtime + many features temporarily, requires rewriting ~80+ files. I do not recommend this for a single iteration.

**Please pick one before I start Part D.** I'll implement A/B/C/E/F/G regardless — they don't depend on this choice.

### 2. `supabase.auth.signInWithPassword` server-side returns a session but Supabase tokens are JWTs already (MEDIUM)
No need to JWE-wrap them with `jose` + `APONNA_SESSION_SECRET`. Sealing them with iron-session-style encryption is fine but adds a dependency for marginal benefit since the tokens are already signed by Supabase. I'll use a simple signed cookie (HMAC) unless you want full encryption.

### 3. Google OAuth flow (LOW)
The system prompt mandates the Lovable broker for Google sign-in. The new login card is email/password only per your spec, so we're fine — but the "Create account" link needs to keep working with the existing signup path.

### 4. Existing `/media` and `/calendar` and `/diary` routes already exist (LOW)
`src/routes/calendar.tsx`, `src/routes/diary.tsx`, `src/routes/media.tsx` are already at the canonical URLs. So Part A is mostly about **wrapping them in a shared parent layout**, not creating new URLs. I'll add `/photos` as the canonical name and make `/media` a redirect.

---

## Implementation plan (assuming Option B-lite for Part D)

### Part A + C — Shared parent layout for the three surfaces
- Create `src/routes/_apps.tsx` — pathless layout route with `<Outlet />`, holds the top tab-bar mounted persistently.
- Move `calendar.tsx`, `diary.tsx`, `media.tsx` under `_apps/`: `_apps/calendar.tsx`, `_apps/diary.tsx`, `_apps/photos.tsx`.
- Add `src/routes/media.tsx` thin redirect → `/photos` for backward compat.
- Sub-content fade-in: wrap `<Outlet />` in a keyed motion div using `framer-motion` (already in deps) keyed by `location.pathname`, 150ms opacity 0→1.

### Part B — Per-surface stripped top tab-bar
- `GlobalTopTabBar` reads current route. When inside `/calendar`, `/diary`, `/photos`:
  - Hide standalone Calendar, Diary, Library nav icons on the left.
  - Keep Me/We toggle + (conditional) Group Members icon.
  - Keep apps-menu + profile on the right.
- On all other routes: unchanged.

### Part E — Apple two-step login
- New `src/routes/login.tsx` replacing/co-existing with `/auth`.
- Two-step card with framer-motion slide+fade transition.
- Step 1: email → Continue. Step 2: password (email read-only with back arrow) → Sign in.
- Inline error, spinner-in-button, no toast.
- Submits to `/api/auth/login` (Part D) — if Part D is deferred, falls back to `supabase.auth.signInWithPassword` directly.

### Part F — Auth loading state
- `_apps` layout uses `beforeLoad` to verify session.
- While unresolved, render top tab-bar with `opacity-50 pointer-events-none`; content area shows minimal centered spinner.
- Once resolved → opacity 1, full interactivity. No layout shift.

### Part D — HTTP-only cookie (Option B-lite, recommended)
- New server routes under `src/routes/api/auth/`:
  - `login.ts` — POST, calls `supabaseAdmin.auth.signInWithPassword`, sets sealed `aponna_session` cookie containing the **refresh token only**.
  - `logout.ts` — POST, clears cookie.
  - `register.ts` — POST, calls `supabaseAdmin.auth.signUp`, sets cookie on success.
  - `session.ts` — GET, reads cookie, uses refresh token to mint a fresh access token via `supabaseAdmin.auth.refreshSession`, returns `{ user, access_token, expires_at }`.
- Client `AuthProvider` on boot calls `/api/auth/session`, takes the returned `access_token`, sets it on the browser Supabase client via `supabase.auth.setSession({ access_token, refresh_token: "" })` so existing `.from()` calls + `attachSupabaseAuth` keep working.
- `persistSession` stays **on** (required by auto-generated client). Cookie is the durable store; localStorage is just a runtime cache that gets re-hydrated from the cookie on each boot.
- Cookie attrs per spec: HttpOnly, Secure (prod), SameSite=Lax, Path=/, Domain=`.aponnacloud.com` in prod (from `APONNA_COOKIE_DOMAIN`), Max-Age = refresh-token lifetime.
- Use `iron-session`-style sealing via `iron-webcrypto` (works in Cloudflare Worker runtime — `jose` would also work).

### Part G — Env vars
Needed before this can run:
- `APONNA_SESSION_SECRET` — 32+ byte random string for cookie sealing.
- `APONNA_COOKIE_DOMAIN` — `.aponnacloud.com` in prod, leave unset in preview.
- Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already set).

---

## Files I'll touch (Option B-lite)

**Create:**
- `src/routes/_apps.tsx` (layout)
- `src/routes/_apps/calendar.tsx`, `_apps/diary.tsx`, `_apps/photos.tsx` (move from current locations)
- `src/routes/login.tsx`
- `src/routes/api/auth/login.ts`, `logout.ts`, `register.ts`, `session.ts`
- `src/lib/session-cookie.server.ts` — seal/unseal helpers
- `src/lib/auth-config.server.ts` — env + cookie attrs

**Modify:**
- `src/routes/calendar.tsx`, `diary.tsx`, `media.tsx` → redirects
- `src/components/GlobalTopTabBar.tsx` — per-surface icon visibility
- `src/lib/auth.tsx` — hydrate from `/api/auth/session` instead of `supabase.auth.getSession()` only
- `src/routes/__root.tsx` — only if needed for the loading state

**Untouched:**
- All calendar/diary/media/team/library page internals
- All hooks
- Auto-generated `client.ts`, `auth-middleware.ts`, `auth-attacher.ts`

---

## What I need from you

1. **Confirm Option B-lite for Part D** (cookie holds refresh token, client still uses the standard Supabase client for queries — no mass migration). Or tell me to do full Option B and I'll quote a much larger effort.
2. **Confirm the `APONNA_SESSION_SECRET` env var** — I'll request it via `add_secret` once you OK the plan.
3. Confirm `/login` is the new route (replacing `/auth`), or should `/auth` stay as an alias.

Once you answer, I'll implement A → G in one pass.
