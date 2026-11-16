/** The farmer's e-mail for alerts, remembered in a first-party cookie
 * on this browser only (no account, no server-side storage yet; see
 * docs/ideas/alerts-and-identity.md). Every access is guarded: blocked
 * cookies just mean the field starts empty. */

export const EMAIL_COOKIE = "ashfield_email";
const MAX_AGE_S = 180 * 24 * 3600;

export function readEmail(): string {
  try {
    const hit = document.cookie.split("; ")
      .find((c) => c.startsWith(`${EMAIL_COOKIE}=`));
    return hit ? decodeURIComponent(hit.slice(EMAIL_COOKIE.length + 1)) : "";
  } catch { return ""; }
}

export function saveEmail(email: string) {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${EMAIL_COOKIE}=${encodeURIComponent(email)}; ` +
      `Max-Age=${MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
  } catch { /* cookies blocked */ }
}

export function forgetEmail() {
  try {
    document.cookie = `${EMAIL_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch { /* cookies blocked */ }
}

export const looksLikeEmail = (s: string) =>
  /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,24}$/.test(s.trim());
