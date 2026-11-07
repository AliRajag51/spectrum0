/* Spectrum's offline catalogue snapshot: what the storefront shows while
   WOOCOMMERCE_CATALOG_ENABLED is off or the store cannot be reached. Prices
   here are display-only; the cart is always priced by WooCommerce. */
export type SnapshotProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  image: string;
  badge: string | null;
  variants: { id: string; label: string; price: number; compareAt?: number; inStock: boolean }[];
  defaultVariant: number;
};

export const snapshotProducts: SnapshotProduct[] = [
  {
    id: "1",
    slug: "5-amino-1-mq",
    name: "5-Amino-1-MQ",
    category: "Research Peptides",
    description:
      "5-Amino-1-MQ compound supplied for controlled laboratory research and analytical applications.",
    image: "/products/5-Amino-1-MQ.webp",
    badge: "Featured",
    variants: [
      {
        id: "5-amino-50mg",
        label: "50mg",
        price: 89,
        compareAt: 109,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "2",
    slug: "acetic-acid",
    name: "Acetic Acid",
    category: "Research Solutions",
    description:
      "Acetic acid solution intended for appropriate laboratory preparation and research procedures.",
    image: "/products/Acetic-Acid.webp",
    badge: null,
    variants: [
      {
        id: "acetic-acid-3ml",
        label: "3ml",
        price: 12,
        compareAt: 16,
        inStock: true,
      },
      {
        id: "acetic-acid-10ml",
        label: "10ml",
        price: 22,
        compareAt: 28,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "3",
    slug: "ahk-cu",
    name: "AHK-Cu",
    category: "Research Peptides",
    description:
      "Copper-binding tripeptide supplied for scientific investigation and laboratory analysis.",
    image: "/products/AHK-Cu.webp",
    badge: "Popular",
    variants: [
      {
        id: "ahk-cu-50mg",
        label: "50mg",
        price: 49,
        compareAt: 59,
        inStock: true,
      },
      {
        id: "ahk-cu-100mg",
        label: "100mg",
        price: 79,
        compareAt: 99,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "4",
    slug: "aod-9604",
    name: "AOD-9604",
    category: "Research Peptides",
    description:
      "Synthetic peptide fragment provided for laboratory-based biochemical research.",
    image: "/products/AOD-9604.webp",
    badge: null,
    variants: [
      {
        id: "aod-9604-5mg",
        label: "5mg",
        price: 45,
        compareAt: 55,
        inStock: true,
      },
      {
        id: "aod-9604-10mg",
        label: "10mg",
        price: 75,
        compareAt: 89,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "5",
    slug: "bpc-157",
    name: "BPC-157",
    category: "Research Peptides",
    description:
      "Synthetic peptide supplied for controlled laboratory experiments and analytical research.",
    image: "/products/BPC-157.webp",
    badge: "Popular",
    variants: [
      {
        id: "bpc-157-10mg",
        label: "10mg",
        price: 59,
        compareAt: 75,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "6",
    slug: "bpc-kpv-blend",
    name: "BPC + KPV Blend",
    category: "Research Blends",
    description:
      "Combined research peptide formulation containing BPC and KPV for laboratory investigation.",
    image: "/products/BPC-KPV-Blend.webp",
    badge: null,
    variants: [
      {
        id: "bpc-kpv-20mg",
        label: "20mg",
        price: 89,
        compareAt: 109,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "7",
    slug: "cagrilintide",
    name: "Cagrilintide",
    category: "Research Peptides",
    description:
      "Research peptide supplied for controlled scientific investigation of biochemical pathways.",
    image: "/products/Cagrilintide.webp",
    badge: null,
    variants: [
      {
        id: "cagrilintide-10mg",
        label: "10mg",
        price: 99,
        compareAt: 119,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "8",
    slug: "cjc-1295-ipamorelin-blend",
    name: "CJC-1295 + Ipamorelin Blend",
    category: "Research Blends",
    description:
      "Dual-peptide blend containing CJC-1295 and Ipamorelin for laboratory research.",
    image: "/products/CJC-1295-Ipamorelin-Blend.webp",
    badge: "Popular",
    variants: [
      {
        id: "cjc-ipamorelin-15mg",
        label: "15mg",
        price: 109,
        compareAt: 129,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "9",
    slug: "dsip",
    name: "DSIP",
    category: "Research Peptides",
    description:
      "Delta sleep-inducing peptide supplied for scientific and analytical laboratory research.",
    image: "/products/DSIP.webp",
    badge: null,
    variants: [
      {
        id: "dsip-10mg",
        label: "10mg",
        price: 49,
        compareAt: 59,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "10",
    slug: "eloralintinde",
    name: "Eloralintinde",
    category: "Research Peptides",
    description:
      "Research compound supplied for laboratory investigation and analytical applications.",
    image: "/products/eloralintinde.webp",
    badge: null,
    variants: [
      {
        id: "eloralintinde-10mg",
        label: "10mg",
        price: 119,
        compareAt: 139,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "11",
    slug: "epitalon",
    name: "Epitalon",
    category: "Research Peptides",
    description:
      "Synthetic tetrapeptide supplied for laboratory research and biochemical analysis.",
    image: "/products/epitalon.webp",
    badge: null,
    variants: [
      {
        id: "epitalon-10mg",
        label: "10mg",
        price: 45,
        compareAt: 55,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "12",
    slug: "ghk-cu",
    name: "GHK-Cu",
    category: "Research Peptides",
    description:
      "Copper-binding peptide supplied for research into peptide chemistry and molecular interactions.",
    image: "/products/ghk-cu.webp",
    badge: "Popular",
    variants: [
      {
        id: "ghk-cu-50mg",
        label: "50mg",
        price: 49,
        compareAt: 59,
        inStock: true,
      },
      {
        id: "ghk-cu-100mg",
        label: "100mg",
        price: 79,
        compareAt: 99,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "13",
    slug: "glow-blend",
    name: "GLOW Blend",
    category: "Research Blends",
    description:
      "Multi-component peptide blend formulated for laboratory research applications.",
    image: "/products/glow-blend.webp",
    badge: "Featured",
    variants: [
      {
        id: "glow-blend-70mg",
        label: "70mg",
        price: 129,
        compareAt: 149,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "14",
    slug: "glutathione",
    name: "Glutathione",
    category: "Research Compounds",
    description:
      "Glutathione compound supplied for analytical and biochemical laboratory research.",
    image: "/products/glutathione.webp",
    badge: null,
    variants: [
      {
        id: "glutathione-1500mg",
        label: "1500mg",
        price: 69,
        compareAt: 85,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "15",
    slug: "igf-1-lr3",
    name: "IGF-1 LR3",
    category: "Research Peptides",
    description:
      "Long-acting IGF-1 analog intended for controlled laboratory research.",
    image: "/products/igf-1-lr3.webp",
    badge: null,
    variants: [
      {
        id: "igf-1-lr3-1mg",
        label: "1mg",
        price: 95,
        compareAt: 115,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "16",
    slug: "kisspeptin-10",
    name: "Kisspeptin-10",
    category: "Research Peptides",
    description:
      "Synthetic peptide supplied for scientific investigation and laboratory analysis.",
    image: "/products/Kisspeptin-10.webp",
    badge: null,
    variants: [
      {
        id: "kisspeptin-10-10mg",
        label: "10mg",
        price: 59,
        compareAt: 75,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "17",
    slug: "klow-blend",
    name: "KLOW Blend",
    category: "Research Blends",
    description:
      "Specialized peptide blend supplied for controlled laboratory research.",
    image: "/products/klow-blend.webp",
    badge: null,
    variants: [
      {
        id: "klow-blend-80mg",
        label: "80mg",
        price: 139,
        compareAt: 159,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "18",
    slug: "kpv",
    name: "KPV",
    category: "Research Peptides",
    description:
      "Synthetic tripeptide supplied for laboratory investigation and analytical applications.",
    image: "/products/kpv.webp",
    badge: null,
    variants: [
      {
        id: "kpv-10mg",
        label: "10mg",
        price: 49,
        compareAt: 59,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "19",
    slug: "ll-37",
    name: "LL-37",
    category: "Research Peptides",
    description:
      "Synthetic peptide supplied for controlled research into peptide structure and molecular interactions.",
    image: "/products/ll-37.webp",
    badge: null,
    variants: [
      {
        id: "ll-37-5mg",
        label: "5mg",
        price: 69,
        compareAt: 85,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "20",
    slug: "melanotan-i",
    name: "Melanotan-I",
    category: "Research Peptides",
    description:
      "Synthetic peptide analog supplied exclusively for laboratory research.",
    image: "/products/melanotan-i.webp",
    badge: null,
    variants: [
      {
        id: "melanotan-i-10mg",
        label: "10mg",
        price: 49,
        compareAt: 59,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "21",
    slug: "melanotan-ii",
    name: "Melanotan-II",
    category: "Research Peptides",
    description:
      "Synthetic peptide analog supplied for controlled scientific investigation.",
    image: "/products/melanotan-ii.webp",
    badge: null,
    variants: [
      {
        id: "melanotan-ii-10mg",
        label: "10mg",
        price: 49,
        compareAt: 59,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "22",
    slug: "mots-c",
    name: "MOTS-C",
    category: "Research Peptides",
    description:
      "Mitochondrial-derived peptide supplied for laboratory-based biochemical research.",
    image: "/products/mots-c.webp",
    badge: "Popular",
    variants: [
      {
        id: "mots-c-10mg",
        label: "10mg",
        price: 59,
        compareAt: 75,
        inStock: true,
      },
      {
        id: "mots-c-40mg",
        label: "40mg",
        price: 149,
        compareAt: 179,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "23",
    slug: "nad-plus",
    name: "NAD+",
    category: "Research Compounds",
    description:
      "Nicotinamide adenine dinucleotide compound for biochemical research and laboratory analysis.",
    image: "/products/nad-plus.webp",
    badge: "Popular",
    variants: [
      {
        id: "nad-500mg",
        label: "500mg",
        price: 69,
        compareAt: 85,
        inStock: true,
      },
      {
        id: "nad-1000mg",
        label: "1000mg",
        price: 109,
        compareAt: 129,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "24",
    slug: "oxytocin",
    name: "Oxytocin",
    category: "Research Peptides",
    description:
      "Synthetic oxytocin peptide supplied for laboratory-based scientific research.",
    image: "/products/oxytocin.webp",
    badge: null,
    variants: [
      {
        id: "oxytocin-5mg",
        label: "5mg",
        price: 49,
        compareAt: 59,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "25",
    slug: "pt-141",
    name: "PT-141",
    category: "Research Peptides",
    description:
      "Synthetic peptide analog supplied for controlled laboratory investigation.",
    image: "/products/pt-141.webp",
    badge: null,
    variants: [
      {
        id: "pt-141-10mg",
        label: "10mg",
        price: 59,
        compareAt: 75,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "26",
    slug: "reconstitution-solution",
    name: "Reconstitution Solution",
    category: "Research Solutions",
    description:
      "Laboratory solution intended for appropriate research preparation procedures.",
    image: "/products/reconstitution-solution.webp",
    badge: null,
    variants: [
      {
        id: "reconstitution-10ml",
        label: "10ml",
        price: 19,
        compareAt: 25,
        inStock: true,
      },
      {
        id: "reconstitution-30ml",
        label: "30ml",
        price: 35,
        compareAt: 45,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "27",
    slug: "selank",
    name: "Selank",
    category: "Research Peptides",
    description:
      "Synthetic peptide supplied for scientific research and biochemical investigation.",
    image: "/products/selank.webp",
    badge: null,
    variants: [
      {
        id: "selank-10mg",
        label: "10mg",
        price: 59,
        compareAt: 75,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "28",
    slug: "semax",
    name: "Semax",
    category: "Research Peptides",
    description:
      "Synthetic peptide supplied for controlled analytical and laboratory research.",
    image: "/products/semax.webp",
    badge: null,
    variants: [
      {
        id: "semax-10mg",
        label: "10mg",
        price: 59,
        compareAt: 75,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "29",
    slug: "sermorelin",
    name: "Sermorelin",
    category: "Research Peptides",
    description:
      "Synthetic peptide analog supplied for scientific investigation in laboratory settings.",
    image: "/products/sermorelin.webp",
    badge: null,
    variants: [
      {
        id: "sermorelin-10mg",
        label: "10mg",
        price: 69,
        compareAt: 85,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "30",
    slug: "ss-31",
    name: "SS-31",
    category: "Research Peptides",
    description:
      "Synthetic tetrapeptide supplied for laboratory investigation and biochemical analysis.",
    image: "/products/ss-31.webp",
    badge: null,
    variants: [
      {
        id: "ss-31-10mg",
        label: "10mg",
        price: 79,
        compareAt: 95,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "31",
    slug: "tb-500",
    name: "TB-500",
    category: "Research Peptides",
    description:
      "Synthetic peptide supplied for controlled laboratory research and analytical applications.",
    image: "/products/tb-500.webp",
    badge: "Popular",
    variants: [
      {
        id: "tb-500-5mg",
        label: "5mg",
        price: 39,
        compareAt: 49,
        inStock: true,
      },
      {
        id: "tb-500-10mg",
        label: "10mg",
        price: 69,
        compareAt: 85,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "32",
    slug: "tesamorelin",
    name: "Tesamorelin",
    category: "Research Peptides",
    description:
      "Synthetic peptide analog supplied for controlled scientific and laboratory research.",
    image: "/products/tesamorelin.webp",
    badge: null,
    variants: [
      {
        id: "tesamorelin-10mg",
        label: "10mg",
        price: 89,
        compareAt: 109,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "33",
    slug: "tesamorelin-ipamorelin-blend",
    name: "Tesamorelin + Ipamorelin Blend",
    category: "Research Blends",
    description:
      "Combined peptide formulation containing Tesamorelin and Ipamorelin for laboratory research.",
    image: "/products/tesamorelin-ipamorelin.webp",
    badge: null,
    variants: [
      {
        id: "tesamorelin-ipamorelin-15mg",
        label: "15mg",
        price: 119,
        compareAt: 139,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "34",
    slug: "thymosin-alpha-1",
    name: "Thymosin Alpha-1",
    category: "Research Peptides",
    description:
      "Synthetic peptide supplied for scientific investigation and laboratory analysis.",
    image: "/products/thymosin-alpha-1.webp",
    badge: null,
    variants: [
      {
        id: "thymosin-alpha-1-5mg",
        label: "5mg",
        price: 69,
        compareAt: 85,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
  {
    id: "35",
    slug: "wolverine",
    name: "Wolverine",
    category: "Research Blends",
    description:
      "Multi-peptide research blend supplied for controlled laboratory investigation.",
    image: "/products/wolverine.webp",
    badge: "Featured",
    variants: [
      {
        id: "wolverine-20mg",
        label: "20mg",
        price: 99,
        compareAt: 119,
        inStock: true,
      },
    ],
    defaultVariant: 0,
  },
];
