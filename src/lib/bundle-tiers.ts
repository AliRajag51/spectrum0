/* Bundle & Save, as the storefront draws it.
 *
 * A quantity chooser wearing better clothes: picking a tier sets the quantity,
 * and the stepper beside it stays in charge of anything finer. Both write to
 * the same number, so they can never say different things - which is what the
 * old pack model got wrong, where "2 Packs" and a stepper on two were two
 * numbers multiplied into four vials.
 *
 * The tiers come from WordPress (`/wp-json/tpc/v1/bundle-tiers`), which is
 * what actually re-prices the line, so the badge and the bill are the same
 * rule read twice. The defaults here are for a storefront with no WordPress
 * configured. An unreachable feed does not fall back to them: WordPress may
 * have switched the offer off. */

export type BundleTier = {
  /** The quantity at which this tier starts; it holds until the next begins. */
  min: number;
  percent: number;
  label: string;
  badge: string;
};

/* The shop's own tiers, as `TPC_Bundle_Save::defaults()` publishes them. */
export const defaultBundleTiers: BundleTier[] = [
  { min: 1, percent: 0, label: "1 Pack", badge: "" },
  { min: 2, percent: 4, label: "2 Packs", badge: "Save 4%" },
  { min: 3, percent: 7, label: "3 Packs", badge: "Save 7%" },
  /* The offer stops at four: a 0% tier at five is what ends it. */
  { min: 5, percent: 0, label: "5 Packs", badge: "" },
];

/**
 * The tiers a shopper can pick from: the base, and every one that saves
 * something. A 0% tier past the base is a boundary, not a choice - it marks
 * where the saving ends - and drawing it as a tile would offer "5 Packs" with
 * nothing to recommend it.
 */
export function offeredTiers(tiers: BundleTier[]): BundleTier[] {
  return tiers.filter((tier) => tier.min === 1 || tier.percent > 0);
}

/** The tile a quantity lights: the tier it earns, unless that is a boundary. */
export function litTier(tiers: BundleTier[], quantity: number): BundleTier | null {
  const tier = tierFor(tiers, quantity);
  return tier && (tier.percent > 0 || tier.min === 1) ? tier : null;
}

/** The tier a quantity has earned: the highest `min` it reaches. */
export function tierFor(tiers: BundleTier[], quantity: number): BundleTier | null {
  let best: BundleTier | null = null;
  for (const tier of tiers) {
    if (quantity >= tier.min && (!best || tier.min > best.min)) best = tier;
  }
  return best;
}

/** The percentage off for a quantity, 0 when no tier applies. */
export function discountFor(tiers: BundleTier[], quantity: number) {
  return tierFor(tiers, quantity)?.percent ?? 0;
}

/** The tier the offer leads with: the biggest saving on the list. */
export function bestTier(tiers: BundleTier[]): BundleTier | null {
  return tiers.reduce<BundleTier | null>(
    (top, tier) => (!top || tier.percent > top.percent ? tier : top),
    null,
  );
}

/**
 * What a quantity costs once its tier is applied, in minor units.
 *
 * Rounds the unit first and then multiplies, because that is the order
 * WooCommerce applies: the site plugin sets a discounted unit price and
 * WooCommerce multiplies it by the quantity. Rounding the whole line once at
 * the end drifts a cent on some prices, and a product page that quotes a cent
 * more than the basket is worse than either number.
 */
export function bundleUnitMinor(unitMinor: number, percent: number) {
  return Math.round(unitMinor * (1 - percent / 100));
}

export function bundleLineMinor(tiers: BundleTier[], unitMinor: number, quantity: number) {
  return bundleUnitMinor(unitMinor, discountFor(tiers, quantity)) * quantity;
}
