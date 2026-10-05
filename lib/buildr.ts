export const BUILDR_DEFAULT_URL = "https://buildrpm.com";

function normalizeBase(url: string) {
  return url.trim().replace(/\/$/, "");
}

export function buildrApiBases() {
  const configured = process.env.BUILDR_API_URL ? normalizeBase(process.env.BUILDR_API_URL) : "";
  return Array.from(new Set([configured, BUILDR_DEFAULT_URL].filter(Boolean)));
}

export type BuildrFamilyAppBootstrap = {
  valid: boolean;
  error?: string;
  email?: string;
  name?: string;
  company_id?: string;
  company_name?: string;
  role?: string;
  password_hash?: string;
};

export async function bootstrapBuildrFamilyAppSso(
  token: string,
  audience = "supplyr",
): Promise<BuildrFamilyAppBootstrap> {
  const trimmed = String(token || "").trim();
  if (!trimmed) return { valid: false, error: "token_required" };

  let lastError = "buildr_unavailable";
  for (const base of buildrApiBases()) {
    try {
      const response = await fetch(`${base}/functions/bootstrapFamilyAppSSO`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed, audience }),
      });
      const data = (await response.json().catch(() => ({}))) as BuildrFamilyAppBootstrap;
      if (!response.ok) {
        lastError = data.error || `Buildr returned ${response.status}`;
        if (response.status >= 400 && response.status < 500) return { valid: false, error: lastError };
        continue;
      }
      if (!data.valid || !data.email || !data.company_id) {
        return { valid: false, error: data.error || "invalid_bootstrap" };
      }
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "buildr_unavailable";
    }
  }
  return { valid: false, error: lastError };
}
