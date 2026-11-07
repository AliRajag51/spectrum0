"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronLeft, Package } from "lucide-react";
import { orderDate, orderMoney, type AccountAddress } from "@/lib/account";
import { useTRPC } from "@/trpc/react";
import { Empty, FormError, Panel, formError } from "./ui";

function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="py-6 text-[15px] text-[#817586]">
      {label}
    </p>
  );
}

/** The customer's orders: the latest few on the dashboard, paged on /account/orders. */
export function Orders({ limit = 10, paged = true }: { limit?: number; paged?: boolean }) {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const orders = useQuery(trpc.account.orders.queryOptions({ page, limit }));
  const data = orders.data;

  return (
    <Panel
      title={paged ? "Orders" : "Recent orders"}
      subtitle="Orders placed with this account."
      action={
        !paged && data?.orders.length ? (
          <Link href="/account/orders" className="text-primary text-[14px] font-semibold">
            View all
          </Link>
        ) : undefined
      }
    >
      {orders.isError ? (
        <FormError message={formError(orders.error.message)} />
      ) : !data ? (
        <Loading label="Loading orders..." />
      ) : data.orders.length ? (
        <>
          <div className="divide-y divide-[#EEE6EF]">
            {data.orders.map((o) => (
              <Link
                key={o.id}
                href={`/account/orders/${o.id}`}
                className="group flex justify-between gap-4 py-4 text-[15px]"
              >
                <div>
                  <p className="text-primary font-semibold">
                    #{o.number}
                    {o.date && (
                      <span className="ml-2 font-normal text-[#817586]">
                        · {orderDate(o.date)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[#817586]">
                    {o.statusLabel} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
                <strong className="text-primary flex items-center gap-2">
                  {orderMoney(o.total, o.currency)}
                  <ArrowUpRight size={16} className="opacity-60 group-hover:opacity-100" />
                </strong>
              </Link>
            ))}
          </div>
          {paged && data.pages > 1 && (
            <div className="mt-5 flex items-center justify-between text-[14px]">
              <button
                type="button"
                disabled={page <= 1 || orders.isFetching}
                onClick={() => setPage((p) => p - 1)}
                className="text-primary rounded-full border border-[#E8DCEA] px-5 py-2 font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-[#817586]">
                Page {page} of {data.pages}
              </span>
              <button
                type="button"
                disabled={page >= data.pages || orders.isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="text-primary rounded-full border border-[#E8DCEA] px-5 py-2 font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty
          icon={Package}
          title="No orders yet"
          description="Your order history will appear here after your first order."
          href="/shop"
          action="Browse compounds"
        />
      )}
    </Panel>
  );
}

function AddressBlock({ title, address }: { title: string; address: AccountAddress }) {
  const name = `${address.firstName} ${address.lastName}`.trim();
  const cityLine = [address.city, address.state, address.postcode].filter(Boolean).join(" ");
  return (
    <article className="rounded-xl border border-[#E8DCEA] p-5">
      <strong className="text-primary">{title}</strong>
      <address className="mt-3 text-[14px] leading-7 text-[#817586] not-italic">
        {address.address1 ? (
          <>
            {name && (
              <>
                {name}
                <br />
              </>
            )}
            {address.company && (
              <>
                {address.company}
                <br />
              </>
            )}
            {address.address1} {address.address2}
            <br />
            {cityLine} {address.country}
          </>
        ) : (
          "Not provided."
        )}
      </address>
    </article>
  );
}

export function OrderDetail({ id }: { id: number }) {
  const trpc = useTRPC();
  const order = useQuery(trpc.account.order.queryOptions({ id }));
  const back = (
    <Link
      href="/account/orders"
      className="text-primary inline-flex items-center gap-1 text-[14px] font-semibold"
    >
      <ChevronLeft size={16} /> All orders
    </Link>
  );

  if (order.isPending)
    return (
      <Panel title="Order" action={back}>
        <Loading label="Loading order..." />
      </Panel>
    );
  if (order.isError)
    return (
      <Panel title="Order" action={back}>
        <FormError message={formError(order.error.message)} />
      </Panel>
    );

  const o = order.data;
  return (
    <>
      <Panel
        title={`Order #${o.number}`}
        subtitle={`${o.date ? `Placed ${orderDate(o.date)} · ` : ""}${o.statusLabel}${
          o.paymentMethodTitle ? ` · ${o.paymentMethodTitle}` : ""
        }`}
        action={back}
      >
        <div className="divide-y divide-[#EEE6EF]">
          {o.lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-4 py-4 text-[15px]">
              <div>
                <p className="text-primary font-semibold">
                  {line.slug ? (
                    <Link href={`/products/${line.slug}`} className="hover:underline">
                      {line.name}
                    </Link>
                  ) : (
                    line.name
                  )}
                </p>
                <p className="mt-1 text-[#817586]">
                  Qty {line.quantity}
                  {line.sku && ` · SKU ${line.sku}`}
                </p>
              </div>
              <strong className="text-primary">{orderMoney(line.total, o.currency)}</strong>
            </div>
          ))}
        </div>
        <dl className="mt-4 space-y-2 border-t border-[#EEE6EF] pt-4 text-[15px]">
          {o.totals.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="text-[#817586]">{row.label}</dt>
              <dd className="text-primary font-semibold">{row.value}</dd>
            </div>
          ))}
        </dl>
        {o.customerNote && (
          <p className="mt-5 rounded-xl bg-[#FCFAFC] p-4 text-[14px] text-[#817586]">
            Note: {o.customerNote}
          </p>
        )}
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <AddressBlock title="Billing address" address={o.billing} />
        <AddressBlock title="Shipping address" address={o.shipping} />
      </div>
    </>
  );
}
