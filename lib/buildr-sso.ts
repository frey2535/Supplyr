import { createHmac, timingSafeEqual } from "node:crypto";

export type FamilySsoClaims = {
  v?: number;
  aud?: string;
  company_id?: string;
  owner_id?: string;
  user_id?: string;
  email?: string;
  name?: string;
  role?: string;
  iat?: number;
  exp?: number;
};

export function familySsoTokenFromSearch(search: URLSearchParams) {
  return (search.get("sso_token") || search.get("token") || search.get("sso") || "").trim();
}

export function verifyFamilySsoToken(token: string, now = Math.floor(Date.now() / 1000)) {
  const secret = String(process.env.FAMILY_APP_SSO_SECRET || "").trim();
  if (!secret) return { error: "sso_not_configured" as const };

  const parts = String(token || "").split(".");
  if (parts.length < 2 || !parts[0] || !parts[1]) return { error: "invalid_token" as const };

  const encodedClaims = parts.length === 3 ? parts[1] : parts[0];
  const signature = parts.length === 3 ? parts[2] : parts[1];
  const signed = parts.length === 3 ? `${parts[0]}.${parts[1]}` : encodedClaims;
  const expectedA = createHmac("sha256", secret).update(signed).digest("hex");
  const expectedB = createHmac("sha256", secret).update(encodedClaims).digest("hex");
  const a = Buffer.from(signature);
  const b1 = Buffer.from(expectedA);
  const b2 = Buffer.from(expectedB);
  const ok =
    (a.length === b1.length && timingSafeEqual(a, b1)) ||
    (a.length === b2.length && timingSafeEqual(a, b2));
  if (!ok) return { error: "invalid_signature" as const };

  let claims: FamilySsoClaims;
  try {
    claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as FamilySsoClaims;
  } catch {
    return { error: "invalid_claims" as const };
  }

  if (claims.v != null && claims.v !== 1) return { error: "unsupported_token" as const };
  const audience = String(claims.aud || "").trim().toLowerCase();
  if (audience && audience !== "supplyr") return { error: "wrong_audience" as const };
  if (!claims.exp || claims.exp <= now) return { error: "expired" as const };
  const email = String(claims.email || "").trim().toLowerCase();
  const companyId = String(claims.company_id || claims.owner_id || "").trim();
  if (!email || !companyId) return { error: "missing_identity" as const };
  return { claims: { ...claims, email, company_id: companyId } };
}
