/* The chemical identity of a product, as WordPress's description states it.
 *
 * The card processor wants the CAS number and molecular weight visible on every
 * product page (the agency, Oct 23). WooCommerce keeps them in a two-column
 * spec table in the long description ("CAS #", "Molecular Weight",
 * "Molecular Formula", ...); this reads those rows out of it. Text only: the
 * HTML never reaches the page. A product whose table lacks a row simply has
 * no such line, and the agency corrects the data on their side. */

export type ProductSpecs = {
  cas?: string;
  molecularWeight?: string;
  molecularFormula?: string;
};

// A <br> in a cell, kept as a line break once the cell's own whitespace is collapsed.
const BREAK = "{{br}}";

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

/** A cell's text: tags gone, entities decoded, whitespace collapsed, capped. A blend's line breaks stay. */
function cellText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, BREAK)
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 31 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .split(BREAK)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 300);
}

/** The CAS number, weight and formula rows of the description's spec table. */
export function productSpecs(description: string): ProductSpecs {
  const specs: ProductSpecs = {};
  for (const row of description.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cellText(cell[1]));
    if (cells.length < 2 || !cells[1]) continue;
    const [label, value] = cells;
    if (!specs.cas && /^CAS\b/i.test(label)) specs.cas = value;
    else if (!specs.molecularWeight && /^Molecular Weight/i.test(label)) specs.molecularWeight = value;
    // "Molecular Formula" or "Molecular Formula (combined range)", never a merged "Sequence ... Molecular Formula" cell.
    else if (!specs.molecularFormula && /^Molecular Formula/i.test(label)) specs.molecularFormula = value;
  }
  return specs;
}
