# PostHog Mainframe

A web-based IBM 3270 terminal emulator that authenticates against PostHog via OAuth + RFC 7591 Dynamic Client Registration. Live at `mainframe.posthog.com`.

The user-facing form looks like a vintage TSO/ISPF login (`ACCOUNT`, `REGION`, `USERID`, `PASSWORD`). Only the `REGION` field is functional — it picks **US** (`us.posthog.com`) or **EU** (`eu.posthog.com`). Pressing **Enter** redirects to PostHog's real OAuth consent screen.

## Stack

- **Next.js 16** (App Router, Turbopack) on Vercel
- **Auth.js v5** with two custom OIDC providers (`posthog-us`, `posthog-eu`)
- **JWT session** in an `__Host-` HttpOnly cookie — no DB
- **rbanffy/3270 font** + a small CSS CRT layer (scanlines, phosphor glow, vignette)
- Tailwind v4 for layout primitives
- Strict CSP + HSTS + frame-ancestors none

## Setup

```bash
pnpm install

# Generate a JWT secret
openssl rand -base64 32

# Register OAuth clients with PostHog (RFC 7591 DCR)
PUBLIC_URL=http://localhost:3000 pnpm tsx scripts/register-client.ts
```

Then fill in `.env.local`:

```env
AUTH_SECRET=<output of openssl>
AUTH_URL=http://localhost:3000
POSTHOG_US_CLIENT_ID=<from script>
POSTHOG_EU_CLIENT_ID=<from script>
```

Run:

```bash
pnpm dev
```

Open <http://localhost:3000> — type `US` or `EU` into the REGION field, press Enter, complete OAuth on PostHog.

## Deployment to `mainframe.posthog.com`

1. `vercel link` and `vercel env add` for `AUTH_SECRET`, `AUTH_URL`, `POSTHOG_US_CLIENT_ID`, `POSTHOG_EU_CLIENT_ID`.
2. Re-run the DCR script with `PUBLIC_URL=https://mainframe.posthog.com` so the redirect URI matches production.
3. Point the `mainframe` CNAME at Vercel; Vercel auto-provisions TLS.

## Security posture

- Public OAuth client → **no client secret** to leak. PKCE-only.
- **Read-only OAuth scopes.** `openid profile email` + a fixed set of PostHog `:read` scopes, defined once in `src/lib/scopes.ts` and shared by both the consent request (`auth.ts`) and the client registration (`register-client.ts`). The list is typed `` `${string}:read` ``, so a mutating scope can't even compile.
- Decorative fields use non-`type="password"` inputs + `-webkit-text-security: disc` so password managers don't autofill anything.
- A dim banner above the field row reads `AUTH MODE: OAUTH-3270 :: PRESS ENTER TO CONNECT TO POSTHOG.COM` — keeps the page out of phishing territory.
- CSP locks `connect-src` / `form-action` to PostHog domains. `frame-ancestors 'none'`, HSTS preload, `X-Content-Type-Options: nosniff`.
- Stateless JWT session in `__Host-authjs.session-token` (HttpOnly, Secure, SameSite=Lax).

## Layout

```
src/
  auth.ts                          Auth.js v5 config (US + EU OIDC providers)
  middleware.ts                    Protects /menu
  app/
    layout.tsx, page.tsx           Root + login screen entry
    globals.css                    CRT + phosphor + 3270 font face
    actions.ts                     "use server" signIn / signOut
    api/auth/[...nextauth]/route.ts
    menu/page.tsx                  ISPF Primary Option Menu
  components/
    Screen.tsx                     CRT bezel + scanline overlay
    OIA.tsx                        Operator Information Area (row 25)
    LoginScreen.tsx                The 3270 login screen
    MenuScreen.tsx                 Post-login menu
  lib/
    regions.ts                     US / EU enumeration
    scopes.ts                      Read-only OAuth scope list (single source of truth)
    screen.ts                      Grid math + POSTHOG banner
scripts/
  register-client.ts               RFC 7591 DCR bootstrap (US + EU)
public/fonts/
  3270-Regular.{woff,ttf}          rbanffy/3270font v3.0.1
```

## Notes for future hacking

- The OIA row (line 25) updates the cursor position every key event. Make sure to thread `cursorRow` / `cursorCol` props if you add new screens.
- Menu options past `1 BROWSE` are placeholders — add `app/menu/<option>/page.tsx` and a route from the command field.
- PostHog scopes live in `src/lib/scopes.ts` and are **read-only by policy**. To surface a new PostHog resource, add its `:read` scope there (the type enforces the `:read` suffix), then re-run the DCR script so the registered client picks it up. Never add a `:write`/mutating scope — this app only reads.
