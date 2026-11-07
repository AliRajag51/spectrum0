import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession } from "@/server/account/session";
import { readViewer } from "@/server/account/service";
import { BridgeError } from "@/server/wordpress/bridge";

/* The signed-in customer for the current render.

   `cache` dedupes the upstream check across a page and everything it renders,
   so one navigation is one `me` call. Nothing here is cached beyond the
   request: a customer session must never be reused for another visitor. */
export const currentViewer = cache(async () => {
  try {
    return await readViewer(await readSession());
  } catch (error) {
    // A store that cannot be reached renders as signed out rather than as a
    // 500. The sign-in form then reports the real reason when it is used.
    if (error instanceof BridgeError) return null;
    throw error;
  }
});

/** Session for an account-only page, or a redirect back to the sign-in forms. */
export async function requireViewer(returnTo?: string) {
  const viewer = await currentViewer();
  if (!viewer) {
    redirect(returnTo ? `/account?redirect=${encodeURIComponent(returnTo)}` : "/account");
  }
  return viewer;
}

/** The session credential for an account-only page, already known to exist. */
export async function requireAuth() {
  await requireViewer();
  const auth = await readSession();
  if (!auth) {
    redirect("/account");
  }
  return auth;
}
