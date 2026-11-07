"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Viewer } from "@/lib/account";
import { useTRPC } from "@/trpc/react";
import { Button, Field, FormError, FormNotice, Panel, formError } from "./ui";

export function Details({ user }: { user: Pick<Viewer, "email" | "firstName" | "lastName"> }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    currentPassword: "",
  });
  const save = useMutation(
    trpc.account.updateProfile.mutationOptions({
      onSuccess: () => {
        setForm((p) => ({ ...p, currentPassword: "" }));
        void queryClient.invalidateQueries({ queryKey: trpc.account.viewer.queryKey() });
        router.refresh();
      },
    }),
  );
  const change = (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const emailChanged = form.email.trim().toLowerCase() !== user.email.toLowerCase();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    save.mutate({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      currentPassword: emailChanged ? form.currentPassword : undefined,
    });
  }

  return (
    <Panel title="Account details" subtitle="Keep your information up to date.">
      <form onSubmit={submit} className="max-w-2xl space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="firstName" value={form.firstName} onChange={change} autoComplete="given-name" maxLength={80} />
          <Field label="Last name" name="lastName" value={form.lastName} onChange={change} autoComplete="family-name" maxLength={80} />
        </div>
        <Field label="Email" name="email" type="email" value={form.email} onChange={change} autoComplete="email" maxLength={320} />
        {emailChanged && (
          <Field
            label="Current password"
            name="currentPassword"
            type="password"
            value={form.currentPassword}
            onChange={change}
            autoComplete="current-password"
            hint="Required to change your email address."
          />
        )}
        <Button busy={save.isPending} busyLabel="Saving...">
          Save changes
        </Button>
        <FormError message={formError(save.error?.message)} />
        {save.isSuccess && <FormNotice message="Account details saved." />}
      </form>
    </Panel>
  );
}
