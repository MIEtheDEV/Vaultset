export const PRODUCT_TYPES = [
  { value: "etb",            label: "Elite Trainer Box (ETB)" },
  { value: "booster_box",    label: "Booster Box" },
  { value: "bundle",         label: "Bundle" },
  { value: "blister",        label: "Blister Pack" },
  { value: "single_pack",    label: "Single Booster Pack" },
  { value: "collection_box", label: "Collection Box" },
  { value: "other",          label: "Other" },
];

export const PRODUCT_TYPE_LABEL = Object.fromEntries(
  PRODUCT_TYPES.map(({ value, label }) => [value, label])
);
