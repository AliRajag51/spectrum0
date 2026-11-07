/* The origin the browser used, for route handlers.
 *
 * Next may put its bind address in `request.url` (http://0.0.0.0:3000 in
 * development); the Host header keeps the browser's host. Used for the
 * same-origin check on form posts and for the address Facebook returns to,
 * which Facebook itself only accepts when it is registered in the Meta app. */

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwarded === "https" || forwarded === "http" ? `${forwarded}:` : url.protocol;
  return `${protocol}//${host}`;
}

/** A form post from this site: a matching Origin, or none and not cross-site. */
export function sameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === new URL(requestOrigin(request)).host;
  } catch {
    return false;
  }
}
