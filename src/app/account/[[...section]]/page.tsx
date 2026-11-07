import type { Metadata } from "next";
import AccountClient, { type AccountViewer } from "@/components/account/AccountClient";
import { safeAccountRedirect } from "@/lib/account";
import { currentViewer } from "@/server/account/viewer";
import { accountsConfigured } from "@/server/wordpress/bridge";

export const metadata: Metadata = {
  title: "My Account | Spectrum Biosciences",
  description: "Manage your Spectrum Biosciences account.",
  robots: { index: false, follow: false },
};

// Per-visitor and private: never prerendered or cached.
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ section = [] }, query] = await Promise.all([params, searchParams]);
  const viewer = await currentViewer();
  // Only what the page prints crosses to the browser.
  const user: AccountViewer | null = viewer
    ? {
        id: viewer.id,
        email: viewer.email,
        displayName: viewer.displayName,
        firstName: viewer.firstName,
        lastName: viewer.lastName,
      }
    : null;

  /* WooCommerce appends key, id and login to the reset URL it emails. The key
     is checked by WordPress against that account, so it is passed through. */
  const resetId = Number(one(query.id));
  const reset =
    section[0] === "reset-password"
      ? {
          key: one(query.key),
          login: one(query.login),
          id: Number.isInteger(resetId) && resetId > 0 ? resetId : undefined,
        }
      : undefined;

  return (
    <AccountClient
      section={section}
      user={user}
      configured={accountsConfigured()}
      redirectTo={
        query.redirect
          ? safeAccountRedirect(query.redirect)
          : safeAccountRedirect(`/account/${section.map(encodeURIComponent).join("/")}`.replace(/\/$/, ""))
      }
      reset={reset}
    />
  );
}
