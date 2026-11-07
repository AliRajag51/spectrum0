/* Groups cache refreshes from a burst of WooCommerce webhooks.

   Every product change clears the whole public catalogue, and the next visitor
   then re-reads it from WordPress. One edit costs one read; fifty edits in a
   bulk save, or a run of stock updates, would cost fifty full reads in as many
   seconds. So the first change refreshes at once, and any that follow within
   the window are collected and refreshed together when it ends: at most one
   refresh per window, and no change is ever dropped.

   Per server process, like the webhook's delivery-id memory. Pure, with the
   clock, the wait and the refresh passed in, so it is tested without Next. */

export type InvalidationWindow = {
  /** "now" when refreshed straight away; "grouped" when held for the window's end. */
  add(tags: readonly string[]): "now" | "grouped";
};

export function createInvalidationWindow(options: {
  windowMs: number;
  flush: (tags: string[]) => void;
  /** Keeps the server alive until the held refresh has run (Next's `after`). */
  hold: (work: Promise<void>) => void;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}): InvalidationWindow {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last = Number.NEGATIVE_INFINITY;
  let pending: Set<string> | null = null;

  return {
    add(tags) {
      if (!pending && now() - last >= options.windowMs) {
        last = now();
        options.flush([...tags]);
        return "now";
      }
      if (pending) {
        for (const tag of tags) pending.add(tag);
        return "grouped";
      }
      const held = new Set(tags);
      pending = held;
      options.hold(
        wait(Math.max(0, last + options.windowMs - now())).then(() => {
          pending = null;
          last = now();
          options.flush([...held]);
        }),
      );
      return "grouped";
    },
  };
}
