import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { bootstrapBuildrFamilyAppSso } from "@/lib/buildr";
import { familySsoTokenFromSearch, verifyFamilySsoToken } from "@/lib/buildr-sso";

export const runtime = "nodejs";

function siteOrigin(request: Request) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function errorRedirect(request: Request, code: string) {
  const url = new URL("/", siteOrigin(request));
  url.searchParams.set("error", "buildr_sso");
  url.searchParams.set("reason", code);
  return NextResponse.redirect(url, 303);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Buildr sidebar launch for Supplyr: verify SSO, bootstrap the Buildr identity,
 * create/link the Supabase user, and establish a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = familySsoTokenFromSearch(url.searchParams);
  const verified = verifyFamilySsoToken(token);
  if ("error" in verified) return errorRedirect(request, verified.error);

  const bootstrap = await bootstrapBuildrFamilyAppSso(token, "supplyr");
  if (!bootstrap.valid) return errorRedirect(request, bootstrap.error || "bootstrap_failed");

  const admin = serviceClient();
  if (!admin) return errorRedirect(request, "supabase_not_configured");

  const email = String(bootstrap.email || "").trim().toLowerCase();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) return errorRedirect(request, "supabase_not_configured");

  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: bootstrap.name || email.split("@")[0],
        buildr_company_id: bootstrap.company_id,
        organization_name: bootstrap.company_name || null,
        role: bootstrap.role || "employee",
      },
    });
    if (created.error && !/already|registered|exists/i.test(created.error.message || "")) {
      return errorRedirect(request, "user_create_failed");
    }
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) return errorRedirect(request, "session_failed");
  }

  const hashedToken = String(link.data?.properties?.hashed_token || "").trim();
  if (!hashedToken) return errorRedirect(request, "session_failed");

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const session = await anon.auth.verifyOtp({ token_hash: hashedToken, type: "email" });
  if (session.error || !session.data.session) return errorRedirect(request, "session_failed");

  // Persist company binding for RLS/membership helpers when the table exists.
  const userId = session.data.session.user.id;
  await admin.from("supplyr_profiles").upsert({
    id: userId,
    email,
    full_name: bootstrap.name || email.split("@")[0],
    buildr_company_id: bootstrap.company_id,
    company_name: bootstrap.company_name || null,
    role: bootstrap.role || "employee",
  }).then(() => undefined).catch(() => undefined);

  const response = NextResponse.redirect(new URL("/", siteOrigin(request)), 303);
  // Hand the browser the session via URL hash fragment exchange page is overkill;
  // set cookies using @supabase/ssr-compatible names when possible.
  response.cookies.set("supplyr_buildr_email", email, { path: "/", httpOnly: false, sameSite: "lax" });
  response.cookies.set("supplyr_buildr_company_id", String(bootstrap.company_id), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });
  response.cookies.set("supplyr_access_token", session.data.session.access_token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });
  response.cookies.set("supplyr_refresh_token", session.data.session.refresh_token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });
  return response;
}
