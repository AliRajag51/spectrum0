"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Button, Field, FormError, FormNotice, Panel, formError } from "./ui";

const blank = { currentPassword: "", password: "", confirm: "" };

/** Signed in: change the password. The server rotates the session cookie. */
export function ChangePasswordForm() {
  const trpc = useTRPC();
  const [form, setForm] = useState(blank);
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation(
    trpc.account.changePassword.mutationOptions({ onSuccess: () => setForm(blank) }),
  );
  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (change.isPending) return;
    if (form.password !== form.confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate({ currentPassword: form.currentPassword, newPassword: form.password });
  }

  return (
    <Panel title="Change password" subtitle="Use at least eight characters.">
      <form onSubmit={submit} className="max-w-xl space-y-5">
        <Field
          label="Current password"
          name="currentPassword"
          type="password"
          value={form.currentPassword}
          onChange={onChange}
          autoComplete="current-password"
        />
        <Field
          label="New password"
          name="password"
          type="password"
          minLength={8}
          maxLength={200}
          value={form.password}
          onChange={onChange}
          autoComplete="new-password"
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          minLength={8}
          maxLength={200}
          value={form.confirm}
          onChange={onChange}
          autoComplete="new-password"
        />
        <Button busy={change.isPending} busyLabel="Updating...">
          Update password
        </Button>
        {mismatch ? (
          <FormError message="Passwords do not match." />
        ) : (
          <FormError message={formError(change.error?.message)} />
        )}
        {change.isSuccess && <FormNotice message="Your password has been updated." />}
      </form>
    </Panel>
  );
}

/** From the emailed link: WooCommerce appends key, id and login to the URL. */
export function ResetPasswordForm({
  resetKey,
  login,
  id,
}: {
  resetKey: string;
  login: string;
  id?: number;
}) {
  const trpc = useTRPC();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const reset = useMutation(trpc.account.resetPassword.mutationOptions());
  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  if (!resetKey) {
    return (
      <Panel title="Reset password" subtitle="This reset link is incomplete or has expired.">
        <Link
          href="/account/lost-password"
          className="bg-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white"
        >
          Request a new link
        </Link>
      </Panel>
    );
  }

  return (
    <Panel title="Reset password" subtitle="Use at least eight characters.">
      {reset.isSuccess ? (
        <div className="space-y-5">
          <FormNotice message="Your password has been reset. You can now sign in with it." />
          <Link
            href="/account"
            className="bg-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reset.isPending) return;
            if (form.password !== form.confirm) {
              setMismatch(true);
              return;
            }
            setMismatch(false);
            reset.mutate({ key: resetKey, login, id, newPassword: form.password });
          }}
          className="max-w-xl space-y-5"
        >
          <Field
            label="New password"
            name="password"
            type="password"
            minLength={8}
            maxLength={200}
            value={form.password}
            onChange={onChange}
            autoComplete="new-password"
          />
          <Field
            label="Confirm password"
            name="confirm"
            type="password"
            minLength={8}
            maxLength={200}
            value={form.confirm}
            onChange={onChange}
            autoComplete="new-password"
          />
          <Button busy={reset.isPending} busyLabel="Saving...">
            Update password
          </Button>
          {mismatch ? (
            <FormError message="Passwords do not match." />
          ) : (
            <FormError message={formError(reset.error?.message)} />
          )}
        </form>
      )}
    </Panel>
  );
}
