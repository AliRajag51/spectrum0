/* The Microsoft Ads sign-up marker (relaunch plan, task 7).
 *
 * GA4's sign_up is WordPress's, sent server-side, so the storefront no longer
 * raises one. Microsoft's is the storefront's, and it cannot always go at once:
 * the page a new member lands on may be one where the UET tag must not load (a
 * restricted product, /login). So the server leaves this marker on the
 * storefront host for an hour - "email" from the sign-up form, "google" from the
 * Google callback - and the tracker sends UET's sign_up on the first page where
 * UET may load, clearing the marker only once UET has taken it. A visitor who
 * opts out (GPC, Do-Not-Sell) has it dropped instead. */

export const SIGNUP_MARKER = "ssb_signup";
export const SIGNUP_MARKER_MAX_AGE = 3600;

export type SignupMethod = "email" | "google" | "facebook";
const METHODS = new Set<string>(["email", "google", "facebook"]);

/** `Set-Cookie` for the response that finished a sign-up. Host-only and script-readable: the tracker clears it. */
export function signupMarkerCookieHeader(method: SignupMethod, secure: boolean) {
  return `${SIGNUP_MARKER}=${method}; Path=/; Max-Age=${SIGNUP_MARKER_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The pending sign-up, if any. Leaves the marker in place. */
export function readSignupMarker(): SignupMethod | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SIGNUP_MARKER}=`))
    ?.slice(SIGNUP_MARKER.length + 1);
  return value && METHODS.has(value) ? (value as SignupMethod) : null;
}

export function clearSignupMarker() {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIGNUP_MARKER}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** UET's sign_up never fires on the gate page itself. */
export const signupDeliverablePath = (path: string) => !/^\/(?:es\/)?login(?:\/|$)/.test(path);
