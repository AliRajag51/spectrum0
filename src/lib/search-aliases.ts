// Search-only vocabulary from what-shoppers-type-2026-09-14.html.
// This does not rename products or imply equivalence to branded medicines.
// Different compounds (NMN, IGF-1 DES, HGH) and unavailable items are excluded.
const compoundAliases: {
  names: string[];
  plainCode?: number;
  terms: string[];
}[] = [
  {
    names: ["glp3r", "glp3rt", "retatrutide"],
    plainCode: 3,
    terms: [
      "reta",
      "retra",
      "retatrutide",
      "retrutide",
      "retatutide",
      "retratutida",
      "glp3",
      "3r",
    ],
  },
  {
    names: ["glp3s", "glp1s", "semaglutide"],
    plainCode: 1,
    terms: [
      "sema",
      "semaglutide",
      "semiglutide",
      "glp1",
      "1s",
      "ozempic",
      "wegovy",
    ],
  },
  {
    names: ["glp3t", "glp2t", "glp1t", "tirzepatide"],
    plainCode: 2,
    terms: [
      "tirz",
      "triz",
      "tirze",
      "trizep",
      "tirzepatide",
      "trizepatide",
      "tirsepatide",
      "tirzepatida",
      "terzipatide",
      "glp2",
      "2t",
      "mounjaro",
      "zepbound",
    ],
  },
  {
    names: ["bacteriostatic", "bacwater"],
    terms: ["bac", "bac water", "water", "hospira"],
  },
  {
    names: ["tesamorelin"],
    terms: ["tesa", "tes", "tess", "tesamoralin", "tesamoreln"],
  },
  { names: ["motsc"], terms: ["mots", "mot", "mot-c"] },
  { names: ["nad"], terms: ["nad", "nad+"] },
  { names: ["ss31"], terms: ["ss", "ss32"] },
  { names: ["klow"], terms: ["klo", "kole"] },
  { names: ["bpc157"], terms: ["bpc"] },
  { names: ["ghkcu"], terms: ["ghk"] },
  { names: ["cjc1295"], terms: ["cjc"] },
  { names: ["glutathione"], terms: ["gluta", "glu", "glut"] },
  { names: ["semax"], terms: ["semex"] },
  {
    names: ["selanksemax", "semaxselank"],
    terms: ["semax selank", "selank + semax blend"],
  },
  { names: ["kpv"], terms: ["kp1", "kvp"] },
  { names: ["glow"], terms: ["gol", "glo", "glória"] },
  { names: ["dsip"], terms: ["sleep", "disp", "delta sleep"] },
  { names: ["pt141"], terms: ["pt", "141"] },
  { names: ["cagrilintide"], terms: ["cag", "cagri", "cagril"] },
  { names: ["selank"], terms: ["zelac", "sel"] },
  { names: ["aod9604"], terms: ["aod"] },
  { names: ["ipamorelin"], terms: ["ipa", "ipamor"] },
  {
    names: ["melanotanii", "melanotan2"],
    terms: ["melanotan", "mela", "melanotan-2", "mt", "mt2"],
  },
  { names: ["tb500"], terms: ["tb", "thymosin beta-4"] },
  { names: ["kisspeptin"], terms: ["kiss", "kis", "kispeptin"] },
  { names: ["5amino1mq"], terms: ["5 amino", "amino"] },
  { names: ["slupp332"], terms: ["slu", "slupp"] },
  {
    names: ["bpc157tb500"],
    terms: ["wolverine", "wolverine stack", "deadpool"],
  },
  { names: ["thymosinalpha1"], terms: ["thy", "thym", "thyamosin alpha"] },
  { names: ["igf1lr3"], terms: ["igf", "igf1"] },
  { names: ["sermorelin"], terms: ["ser", "serm", "sermoralin"] },
  {
    names: ["epithalon", "epitalon"],
    terms: ["epi", "ep", "epitalon", "epithalon"],
  },
  { names: ["oxytocin"], terms: ["oxy", "oxcytocin", "oxytocin peptide"] },
  { names: ["ll37"], terms: ["ll"] },
  { names: ["eloralintide"], terms: ["elora", "el", "elor"] },
  { names: ["cartalax"], terms: ["catalan", "cartilax"] },
  { names: ["cjc1295ipamorelin"], terms: ["cdc-1295", "cjc imp", "cjc ipa"] },
  { names: ["vip"], terms: ["vp"] },
  { names: ["ghrp2", "ghrp6"], terms: ["grhp"] },
  {
    names: ["ipamorelintesamorelin", "tesamorelinipamorelin"],
    terms: ["ipamorelin & tesamorelin blend", "ipamorelin tesamoreln"],
  },
];

export function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function searchKey(value: string) {
  return normalizeSearch(
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  );
}

const searchTerms = compoundAliases.flatMap((alias) =>
  alias.terms.map((term) => ({ alias, term: searchKey(term) })),
);

function startsAtWord(query: string, value: string) {
  // Never match "reta" inside "secretagogue"; still tolerate hyphens/spaces.
  return value
    .split(/\s+/)
    .some((_, index, words) =>
      searchKey(words.slice(index).join(" ")).startsWith(query),
    );
}

export function matchesCompoundSearch(
  query: string,
  value: string,
  identity = value,
) {
  const key = searchKey(query);
  if (!key) return true;
  const name = searchKey(identity);
  const matchingTerms = searchTerms.filter(
    ({ term }) =>
      key === term ||
      (key.startsWith(term) &&
        /^\d+(?:mg|mcg|ml)$/.test(key.slice(term.length))),
  );

  if (matchingTerms.length) {
    return matchingTerms.some(({ alias, term }) => {
      const matchesName =
        alias.names.some((candidate) => name.includes(candidate)) ||
        (alias.plainCode !== undefined &&
          new RegExp(
            `\\bglp[\\s-]?${alias.plainCode}\\b(?!\\s*[/\\-]\\s*[rst]\\b)`,
            "i",
          ).test(identity));
      return (
        matchesName &&
        (key === term || startsAtWord(key.slice(term.length), value))
      );
    });
  }
  return startsAtWord(key, value);
}
