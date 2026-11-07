"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronRight,
  CreditCard,
  Download,
  FileCheck2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Package,
  UserRound,
} from "lucide-react";
import type { Viewer } from "@/lib/account";
import { useTRPC } from "@/trpc/react";
import { Addresses } from "./Addresses";
import { AuthForms, LostPasswordForm } from "./AuthForms";
import { Details } from "./Details";
import { OrderDetail, Orders } from "./Orders";
import { ChangePasswordForm, ResetPasswordForm } from "./PasswordForms";
import { Empty, FormError, Panel, formError } from "./ui";

const nav = [
  { slug: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { slug: "orders", label: "Orders", icon: Package },
  { slug: "downloads", label: "Downloads & COAs", icon: Download },
  { slug: "addresses", label: "Addresses", icon: MapPin },
  { slug: "details", label: "Account details", icon: UserRound },
  { slug: "password", label: "Password", icon: LockKeyhole },
  { slug: "payment-methods", label: "Payment methods", icon: CreditCard },
] as const;

/** The viewer fields the account pages print; nothing else reaches the browser. */
export type AccountViewer = Pick<Viewer, "id" | "email" | "displayName" | "firstName" | "lastName">;

export type ResetLink = { key: string; login: string; id?: number };

export default function AccountClient({
  section = [],
  user,
  configured,
  redirectTo = "/account",
  reset,
}: {
  section?: string[];
  user: AccountViewer | null;
  configured: boolean;
  redirectTo?: string;
  reset?: ResetLink;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [signedOut, setSignedOut] = useState(false);
  const signOut = useMutation(
    trpc.account.signOut.mutationOptions({
      onSuccess: () => {
        // Their orders and addresses must not survive for the next person.
        queryClient.clear();
        setSignedOut(true);
        router.replace("/account");
        router.refresh();
      },
    }),
  );

  const slug = section[0] || "dashboard";
  const orderId = slug === "orders" && section[1] ? Number(section[1]) : null;
  const active = nav.find((n) => n.slug === slug) ?? nav[0];
  const viewer = signedOut ? null : user;
  const greeting = viewer ? viewer.firstName || viewer.displayName || "researcher" : "";

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-[#EEE6EF] px-5 py-6 sm:px-8 md:py-12">
        <div className="mx-auto max-w-7xl">
          <nav
            className="mb-5 flex items-center gap-2 text-[13px] text-[#817586]"
            aria-label="Breadcrumb"
          >
            <Link href="/">Home</Link>
            <ChevronRight size={14} />
            <span className="text-primary font-semibold">My Account</span>
          </nav>
          <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
            Spectrum Biosciences
          </p>
          <h1 className="section-heading">
            {viewer && slug !== "dashboard" ? active.label : "My Account"}
            <span className="text-secondary">.</span>
          </h1>
          <p className="mt-2 text-[15px] text-[#817586]">
            {viewer
              ? "Manage your profile, orders and documents."
              : "Sign in or create your account."}
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {slug === "reset-password" ? (
          <div className="mx-auto max-w-xl py-12">
            <ResetPasswordForm
              resetKey={reset?.key ?? ""}
              login={reset?.login ?? ""}
              id={reset?.id}
            />
          </div>
        ) : !viewer ? (
          slug === "lost-password" ? (
            <LostPasswordForm />
          ) : (
            <AuthForms redirectTo={redirectTo} configured={configured} />
          )
        ) : (
          <div className="grid items-start gap-7 py-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:py-14">
            <aside className="rounded-[22px] border border-[#ECE2ED] bg-white p-3 lg:sticky lg:top-24">
              <div className="border-b border-[#EEE6EF] p-3 pb-5">
                <p className="text-primary text-[16px] font-bold">
                  {`${viewer.firstName} ${viewer.lastName}`.trim() || viewer.displayName}
                </p>
                <p className="mt-1 truncate text-[13px] text-[#817586]">{viewer.email}</p>
              </div>
              <nav
                aria-label="Account sections"
                className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1"
              >
                {nav.map(({ slug: navSlug, label, icon: Icon }) => (
                  <Link
                    key={navSlug}
                    href={navSlug === "dashboard" ? "/account" : `/account/${navSlug}`}
                    className={`flex items-center gap-2 rounded-xl px-3 py-3 text-[14px] font-semibold ${active.slug === navSlug ? "bg-primary text-white" : "hover:text-primary text-[#635367] hover:bg-[#F8EFF9]"}`}
                  >
                    <Icon size={18} className="shrink-0" />
                    {label}
                  </Link>
                ))}
              </nav>
              <button
                type="button"
                disabled={signOut.isPending}
                onClick={() => {
                  if (!signOut.isPending) signOut.mutate();
                }}
                className="mt-3 flex w-full items-center gap-3 border-t border-[#EEE6EF] px-3 py-4 text-[14px] font-semibold text-[#7A617D] disabled:opacity-50"
              >
                <LogOut size={18} /> {signOut.isPending ? "Signing out..." : "Sign out"}
              </button>
              <FormError message={formError(signOut.error?.message)} className="px-3 pb-3" />
            </aside>
            <div className="min-w-0 space-y-5">
              {active.slug === "dashboard" && (
                <>
                  <div className="rounded-[22px] bg-[linear-gradient(110deg,#35143E,#55205F)] p-6 text-white sm:p-8">
                    <p className="text-[13px] font-bold tracking-widest text-[#F6B17D] uppercase">
                      Account overview
                    </p>
                    <h2 className="font-heading mt-3 text-[34px] font-bold">
                      Welcome, {greeting}.
                    </h2>
                    <p className="mt-2 text-[15px] text-white/80">
                      Your research account and documentation in one place.
                    </p>
                  </div>
                  <Orders limit={3} paged={false} />
                  <Panel title="Everything else">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {nav.slice(1, 5).map(({ slug: navSlug, label, icon: Icon }) => (
                        <Link
                          key={navSlug}
                          href={`/account/${navSlug}`}
                          className="text-primary flex items-center gap-3 rounded-xl border border-[#EEE6EF] p-5 text-[15px] font-semibold hover:bg-[#FCF7FD]"
                        >
                          <Icon size={21} />
                          {label}
                          <ArrowUpRight size={16} className="ml-auto" />
                        </Link>
                      ))}
                    </div>
                  </Panel>
                </>
              )}
              {active.slug === "orders" &&
                (orderId !== null ? (
                  Number.isInteger(orderId) && orderId > 0 ? (
                    <OrderDetail id={orderId} />
                  ) : (
                    <Panel title="Order">
                      <FormError message="That order could not be found." />
                    </Panel>
                  )
                ) : (
                  <Orders />
                ))}
              {active.slug === "downloads" && (
                <Panel
                  title="Downloads & COAs"
                  subtitle="Certificates of analysis for every batch are published in our library."
                >
                  <Empty
                    icon={FileCheck2}
                    title="No documents attached to your orders"
                    description="Batch certificates are available in the public CoA library. Search by compound or lot number."
                    href="/coa"
                    action="Browse CoA library"
                  />
                </Panel>
              )}
              {active.slug === "addresses" && <Addresses />}
              {active.slug === "details" && <Details key={viewer.id} user={viewer} />}
              {active.slug === "password" && <ChangePasswordForm />}
              {active.slug === "payment-methods" && (
                <Panel
                  title="Payment methods"
                  subtitle="Payment details are entered securely at checkout."
                >
                  <Empty
                    icon={CreditCard}
                    title="No saved payment methods"
                    description="We don't store card details on this site. You'll choose how to pay each time you check out."
                  />
                </Panel>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
