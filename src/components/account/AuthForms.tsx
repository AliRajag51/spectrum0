"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  emptyDeclaration,
  missingDeclaration,
  toDeclaration,
  type DeclarationAnswers,
} from "@/lib/research-declaration";
import { useTRPC } from "@/trpc/react";
import { ResearchDeclarationFields } from "./ResearchDeclarationFields";
import { Button, Field, FormError, Panel, formError } from "./ui";

/* Signed-out account surface: sign in and open an account side by side, plus
   the lost-password request. Sessions are minted by the server as an
   HttpOnly cookie; nothing here ever sees the credential. */

function useAfterAuth(redirectTo: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return () => {
    // Anything cached belonged to the previous (signed-out) visitor.
    void queryClient.invalidateQueries();
    router.replace(redirectTo);
    router.refresh();
  };
}

export function AuthForms({
  redirectTo,
  configured,
}: {
  redirectTo: string;
  configured: boolean;
}) {
  const trpc = useTRPC();
  const afterAuth = useAfterAuth(redirectTo);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [declaration, setDeclaration] =
    useState<DeclarationAnswers>(emptyDeclaration);
  const [missing, setMissing] = useState<string[]>([]);

  const signIn = useMutation(
    trpc.account.signIn.mutationOptions({ onSuccess: afterAuth }),
  );
  const register = useMutation(
    trpc.account.register.mutationOptions({ onSuccess: afterAuth }),
  );

  const changeLogin = (e: ChangeEvent<HTMLInputElement>) =>
    setLogin((p) => ({ ...p, [e.target.name]: e.target.value }));
  const change = (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  function submitSignIn(e: FormEvent) {
    e.preventDefault();
    if (signIn.isPending || register.isPending) return;
    register.reset();
    signIn.mutate({
      email: login.email.trim(),
      password: login.password,
      remember: true,
    });
  }

  function submitRegister(e: FormEvent) {
    e.preventDefault();
    if (signIn.isPending || register.isPending) return;
    const answers = toDeclaration(declaration, "en");
    if (!answers) {
      setMissing(missingDeclaration(declaration));
      return;
    }
    setMissing([]);
    signIn.reset();
    register.mutate({
      email: form.email.trim(),
      password: form.password,
      firstName: form.firstName.trim() || undefined,
      lastName: form.lastName.trim() || undefined,
      declaration: answers,
    });
  }

  const error = formError(signIn.error?.message ?? register.error?.message);

  return (
    <div className="grid gap-6 py-10 lg:grid-cols-2 lg:gap-8 lg:py-14">
      {!configured && (
        <p
          role="status"
          className="rounded-xl bg-[#FCF7FD] px-4 py-3 text-[14px] text-[#7A617D] lg:col-span-2"
        >
          Online accounts are not connected on this site yet. Please contact our
          team for help with an order.
        </p>
      )}
      <section className="rounded-[22px] border border-[#ECE2ED] bg-white p-6 sm:p-9">
        <span className="text-gold text-[13px] font-bold tracking-widest uppercase">
          Existing record
        </span>
        <h2 className="font-heading text-primary mt-3 text-[32px] font-bold">
          Welcome back.
        </h2>
        <p className="mt-2 text-[15px] text-[#817586]">
          Sign in with the email you order with.
        </p>
        <form onSubmit={submitSignIn} className="mt-7 space-y-5">
          <Field
            label="Email"
            name="email"
            type="email"
            value={login.email}
            onChange={changeLogin}
            autoComplete="email"
            maxLength={320}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            value={login.password}
            onChange={changeLogin}
            autoComplete="current-password"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button busy={signIn.isPending} busyLabel="Signing in...">
              Sign in
            </Button>
            <Link
              href="/account/lost-password"
              className="text-primary text-[14px] font-semibold"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </section>
      <section className="rounded-[22px] border border-[#ECE2ED] bg-[#FCF9FD] p-6 sm:p-9">
        <span className="text-gold text-[13px] font-bold tracking-widest uppercase">
          New to Spectrum?
        </span>
        <h2 className="font-heading text-primary mt-3 text-[32px] font-bold">
          Open an Account.
        </h2>
        <p className="mt-2 text-[15px] leading-7 text-[#817586]">
          Order history and batch certificates, filed under one address.
        </p>
        <form onSubmit={submitRegister} className="mt-7 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              name="firstName"
              value={form.firstName}
              onChange={change}
              autoComplete="given-name"
              maxLength={80}
            />
            <Field
              label="Last name"
              name="lastName"
              value={form.lastName}
              onChange={change}
              autoComplete="family-name"
              maxLength={80}
            />
          </div>
          <Field
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={change}
            autoComplete="email"
            maxLength={320}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            minLength={8}
            maxLength={200}
            value={form.password}
            onChange={change}
            autoComplete="new-password"
          />
          <p className="text-[14px] text-[#817586]">At least 8 characters.</p>
          <ResearchDeclarationFields
            idPrefix="register"
            value={declaration}
            onChange={(next) => {
              setDeclaration(next);
              if (missing.length) setMissing(missingDeclaration(next));
            }}
            missing={missing}
          />
          <Button busy={register.isPending} busyLabel="Opening account...">
            Open an Account
          </Button>
        </form>
      </section>
      <FormError message={error} className="lg:col-span-2" />
    </div>
  );
}

export function LostPasswordForm() {
  const trpc = useTRPC();
  const [email, setEmail] = useState("");
  const request = useMutation(trpc.account.lostPassword.mutationOptions());
  return (
    <div className="mx-auto max-w-xl py-12">
      <Panel
        title="Forgot password?"
        subtitle="Enter your email address or username and we'll email you a link to set a new password."
      >
        {request.isSuccess ? (
          <p role="status" className="text-primary text-[14px] leading-7">
            If an account matches those details, a reset link is on its way.
            Check your inbox (and spam folder) for an email from us.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (request.isPending) return;
              request.mutate({ email: email.trim() });
            }}
            className="space-y-5"
          >
            <Field
              label="Email address or username"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={320}
            />
            <Button busy={request.isPending} busyLabel="Sending...">
              Send reset link
            </Button>
          </form>
        )}
        <Link
          href="/account"
          className="text-primary mt-5 inline-block text-[14px] font-semibold"
        >
          Back to sign in
        </Link>
        <FormError
          message={formError(request.error?.message)}
          className="mt-4"
        />
      </Panel>
    </div>
  );
}
