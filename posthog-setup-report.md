# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into PostHog Mainframe, a retro IBM 3270 terminal interface for browsing PostHog data. The integration covers:

- **Client-side initialization** via `instrumentation-client.ts` with a reverse proxy at `/ingest`
- **Server-side tracking** via `posthog-node` in server actions and the NextAuth JWT callback
- **User identification** both server-side (on OAuth sign-in via `src/auth.ts`) and client-side (on menu mount via `src/components/MenuScreen.tsx`)
- **Session cleanup** via `posthog.reset()` on sign-out (server-side)
- **Reverse proxy rewrites** added to `next.config.ts` for reliable event delivery
- **Error exception capture** enabled via `capture_exceptions: true` in PostHog init

## Events

| Event Name | Description | File |
|---|---|---|
| `sign_in_attempted` | User submits the login form to initiate OAuth sign-in with their PostHog account. | `src/components/LoginScreen.tsx` |
| `user_signed_in` | User successfully completes OAuth authentication and a new session is created. | `src/auth.ts` |
| `user_signed_out` | User terminates their session by logging off from the mainframe. | `src/app/actions.ts` |
| `menu_option_selected` | User selects a menu option or types a command from the primary option menu. | `src/components/MenuScreen.tsx` |
| `insight_opened` | User opens an insight from the browse list to view its detailed data. | `src/components/BrowseScreen.tsx` |
| `hogql_query_executed` | User executes a HogQL query in the SQL query editor (server-side, includes row/column counts). | `src/app/actions.ts` |
| `hogql_query_failed` | A HogQL query returned an error and was not executed successfully. | `src/components/SqlScreen.tsx` |
| `feature_flag_viewed` | User opens the detail view of a specific feature flag. | `src/components/FlagsScreen.tsx` |
| `experiment_viewed` | User opens the detail view of a specific experiment. | `src/components/ExperimentsScreen.tsx` |
| `news_article_read` | User opens a news article from the NYT bulletin to read its full content. | `src/components/NewsScreen.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/471985/dashboard/1757862)
- [Sign-in Conversion Funnel](https://us.posthog.com/project/471985/insights/LpE1LLlm)
- [Feature Section Usage](https://us.posthog.com/project/471985/insights/nkJvFFVO)
- [Daily Active Users](https://us.posthog.com/project/471985/insights/2Z96t89k)
- [HogQL Query Success vs Failure Rate](https://us.posthog.com/project/471985/insights/C9I3vW5l)
- [Sign-ins and Sign-outs](https://us.posthog.com/project/471985/insights/tqwWbcN7)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — the wizard identifies on `MenuScreen` mount (which runs every time the menu is loaded), so returning sessions should be covered, but verify in PostHog that sessions are linked to person profiles.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
