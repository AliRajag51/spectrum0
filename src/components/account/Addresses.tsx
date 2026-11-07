"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import {
  addressKinds,
  emptyAddress,
  type AccountAddress,
  type AccountAddressBook,
  type AddressKind,
} from "@/lib/account";
import { useTRPC } from "@/trpc/react";
import { Button, Empty, Field, FormError, FormNotice, Panel, formError, inputClass } from "./ui";

/* WooCommerce keeps one billing and one shipping address per account, so the
   book is two cards, each editable in place. */

const kindLabel: Record<AddressKind, string> = { billing: "Billing", shipping: "Shipping" };

function AddressForm({
  kind,
  book,
  onSaved,
  onCancel,
}: {
  kind: AddressKind;
  book: AccountAddressBook;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const original = book[kind];
  const [form, setForm] = useState<AccountAddress>({
    ...emptyAddress,
    ...original,
    country: original.country || "US",
  });
  const loadedStates = kind === "billing" ? book.billingStates : book.shippingStates;
  const changedCountry = form.country !== (original.country || "US") || !original.country;
  const lookup = useQuery({
    ...trpc.account.states.queryOptions({ country: form.country }),
    enabled: changedCountry && form.country.length === 2,
  });
  const states = changedCountry ? (lookup.data ?? {}) : loadedStates;
  const save = useMutation(
    trpc.account.saveAddress.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.account.addresses.queryKey() });
        onSaved();
      },
    }),
  );
  const change = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    save.mutate({ kind, fields: { ...form, country: form.country.toUpperCase() } });
  }

  const stateEntries = Object.entries(states);
  return (
    <form onSubmit={submit} className="space-y-4">
      <h3 className="text-primary text-[16px] font-bold">{kindLabel[kind]} address</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" value={form.firstName} onChange={change} autoComplete="given-name" maxLength={80} />
        <Field label="Last name" name="lastName" value={form.lastName} onChange={change} autoComplete="family-name" maxLength={80} />
      </div>
      <Field label="Company" name="company" required={false} value={form.company} onChange={change} autoComplete="organization" maxLength={120} />
      <label className="block text-[14px] font-semibold text-[#49394F]">
        Country
        <select
          name="country"
          value={form.country}
          required
          autoComplete="country"
          onChange={(e) => setForm((p) => ({ ...p, country: e.target.value, state: "" }))}
          className={`${inputClass} mt-2`}
        >
          <option value="">Select a country</option>
          {Object.entries(book.countries).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
          {!book.countries[form.country] && form.country && (
            <option value={form.country}>{form.country}</option>
          )}
        </select>
      </label>
      <Field label="Address line 1" name="address1" value={form.address1} onChange={change} autoComplete="address-line1" maxLength={200} />
      <Field label="Address line 2" name="address2" required={false} value={form.address2} onChange={change} autoComplete="address-line2" maxLength={200} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" name="city" value={form.city} onChange={change} autoComplete="address-level2" maxLength={120} />
        {stateEntries.length ? (
          <label className="block text-[14px] font-semibold text-[#49394F]">
            State
            <select
              name="state"
              value={form.state}
              required
              autoComplete="address-level1"
              onChange={change}
              className={`${inputClass} mt-2`}
            >
              <option value="">Select</option>
              {stateEntries.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Field label="State" name="state" required={false} value={form.state} onChange={change} autoComplete="address-level1" maxLength={120} />
        )}
        <Field label="ZIP" name="postcode" value={form.postcode} onChange={change} autoComplete="postal-code" maxLength={40} />
      </div>
      {kind === "billing" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" name="email" type="email" required={false} value={form.email} onChange={change} autoComplete="email" maxLength={320} />
          <Field label="Phone" name="phone" type="tel" required={false} value={form.phone} onChange={change} autoComplete="tel" maxLength={40} />
        </div>
      )}
      <div className="flex gap-3">
        <Button busy={save.isPending} busyLabel="Saving...">
          Save address
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-primary rounded-full border border-[#E8DCEA] px-5 text-[14px]"
        >
          Cancel
        </button>
      </div>
      <FormError message={formError(save.error?.message)} />
    </form>
  );
}

export function Addresses() {
  const trpc = useTRPC();
  const book = useQuery(trpc.account.addresses.queryOptions());
  const [editing, setEditing] = useState<AddressKind | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Panel title="Addresses" subtitle="The billing and shipping addresses used at checkout.">
      {book.isPending ? (
        <p role="status" className="py-6 text-[15px] text-[#817586]">
          Loading addresses...
        </p>
      ) : book.isError ? (
        <FormError message={formError(book.error.message)} />
      ) : editing ? (
        <AddressForm
          key={editing}
          kind={editing}
          book={book.data}
          onSaved={() => {
            setEditing(null);
            setSaved(true);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {addressKinds.map((kind) => {
              const a = book.data[kind];
              const name = `${a.firstName} ${a.lastName}`.trim();
              return (
                <article key={kind} className="rounded-xl border border-[#E8DCEA] p-5">
                  <strong className="text-primary">{kindLabel[kind]}</strong>
                  {a.address1 ? (
                    <address className="mt-3 text-[14px] leading-7 text-[#817586] not-italic">
                      {name}
                      {a.company && (
                        <>
                          <br />
                          {a.company}
                        </>
                      )}
                      <br />
                      {a.address1} {a.address2}
                      <br />
                      {a.city}, {a.state} {a.postcode}
                    </address>
                  ) : (
                    <p className="mt-3 text-[14px] leading-7 text-[#817586]">
                      No {kind} address saved yet.
                    </p>
                  )}
                  <div className="mt-4 flex gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSaved(false);
                        setEditing(kind);
                      }}
                      className="text-primary text-[14px] font-semibold"
                    >
                      {a.address1 ? "Edit" : "Add address"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {!book.data.billing.address1 && !book.data.shipping.address1 && (
            <div className="mt-4">
              <Empty
                icon={MapPin}
                title="No addresses saved"
                description="Save an address to speed up checkout."
              />
            </div>
          )}
          <div className="mt-4">
            <FormNotice message={saved ? "Address saved." : undefined} />
          </div>
        </>
      )}
    </Panel>
  );
}
