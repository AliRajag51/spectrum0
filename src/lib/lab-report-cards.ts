/* What the report feed does not carry.
 *
 * `tpc/v1/lab-reports` publishes the analytical record, not the page around
 * it. Three things live only here: the product photograph the card shows,
 * which is a local asset; the element id each card has rendered with since
 * the directory was a checked-in file; and Sermorelin's certificate, which is
 * a supplied PDF this site hosts itself rather than links to WordPress
 * (public/reports/README.md). The array order is the order the library lists
 * its cards in.
 *
 * Keyed by `normaliseReportTitle` of the published title, because WordPress
 * hands the same title back as `GHK-Cu &#8211; 100MG` or `GHK-Cu - 100MG`
 * depending on who typed it. A report with no row here still renders: it
 * falls back to the linked product's photograph, takes an id from its feed
 * id, and lists after every card that is named here. */
export type LabReportCard = {
  /** The published title, normalised. */
  title: string;
  /** The `id` the card's heading is labelled by. */
  id: string;
  image: string;
  /** A certificate served from `public/` instead of from WordPress. */
  coa?: string;
};

/* Spectrum has no hand-placed report cards yet: every report lists from the
   WordPress feed with its product photo. Add entries here to pin an order or image. */
export const labReportCards: LabReportCard[] = [];
