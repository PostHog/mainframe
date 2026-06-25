import NextAuth, { type NextAuthConfig } from "next-auth";
import { REGIONS, regionHost, type Region } from "@/lib/regions";
import { OAUTH_SCOPE_STRING } from "@/lib/scopes";
import { getPostHogClient } from "@/lib/posthog-server";

type PostHogProfile = {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
};

function posthogProvider(region: Region) {
  const cfg = REGIONS[region];
  const host = regionHost(region);
  const clientIdEnv = region === "US" ? "POSTHOG_US_CLIENT_ID" : "POSTHOG_EU_CLIENT_ID";
  const clientId = process.env[clientIdEnv];
  return {
    id: cfg.providerId,
    name: `PostHog ${cfg.label}`,
    type: "oidc" as const,
    issuer: host,
    authorization: { params: { scope: OAUTH_SCOPE_STRING } },
    clientId,
    clientSecret: "",
    client: {
      token_endpoint_auth_method: "none" as const,
    },
    checks: ["pkce", "state"] as ("pkce" | "state")[],
    profile(profile: PostHogProfile) {
      return {
        id: profile.sub ?? profile.email ?? "unknown",
        email: profile.email ?? null,
        name: profile.name ?? profile.preferred_username ?? profile.email ?? "user",
        region,
      };
    },
  };
}

export const authConfig: NextAuthConfig = {
  providers: [posthogProvider("US"), posthogProvider("EU")],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  trustHost: true,
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        // @ts-expect-error custom field
        token.region = user.region ?? token.region;
      }
      if (account?.provider === "posthog-us") token.region = "US";
      if (account?.provider === "posthog-eu") token.region = "EU";
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      // `account` is only present on initial sign-in (not token refreshes)
      if (account && token.email) {
        const posthog = getPostHogClient();
        const distinctId = token.email as string;
        posthog.identify({
          distinctId,
          properties: {
            email: token.email,
            name: token.name,
            region: token.region,
          },
        });
        posthog.capture({
          distinctId,
          event: "user_signed_in",
          properties: {
            provider: account.provider,
            region: token.region,
          },
        });
        await posthog.shutdown();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string) ?? session.user.name;
        // @ts-expect-error custom field
        session.user.region = token.region;
      }
      // accessToken is read server-side only (via auth()) — never passed to client components
      (session as unknown as Record<string, unknown>).accessToken = token.accessToken;
      (session as unknown as Record<string, unknown>).expiresAt = token.expiresAt;
      return session;
    },
    authorized({ auth, request }) {
      const url = new URL(request.url);
      const isProtected = url.pathname.startsWith("/menu");
      if (!isProtected) return true;
      return Boolean(auth?.user);
    },
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Host-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
