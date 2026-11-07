/* WooCommerce's notices are written for its own HTML templates: quotes arrive
   as &quot;, apostrophes as &#039;, and some carry <strong> or a link. The
   storefront shows them as text (React escapes it), so they are turned back
   into the characters they stand for first (the agency, Oct 27: a coupon
   notice read Coupon &quot;welcome30&quot; has already been applied). */

const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

function codePoint(value: number) {
  // Only real characters: no NUL, no surrogates, nothing past Unicode.
  return value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
    ? String.fromCodePoint(value)
    : "";
}

/** A WooCommerce notice as plain text: tags dropped, entities decoded, spaces tidied. */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const hex = entity[1] === "x" || entity[1] === "X";
        return codePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)) || match;
      }
      return NAMED[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}
