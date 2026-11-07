import "server-only";

import { cookies } from "next/headers";
import { decodeSessionValue, SESSION_COOKIE } from "@/lib/session-cookie";

export {
  SESSION_COOKIE,
  clearedDisplayCookieHeaders,
  clearedSessionCookieHeader,
  displayCookieHeaders,
  readSessionFromHeader,
  sessionCookieHeader,
} from "@/lib/session-cookie";

/** The auth credential for the current Server Component render, or null. */
export async function readSession() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? decodeSessionValue(value) : null;
}
