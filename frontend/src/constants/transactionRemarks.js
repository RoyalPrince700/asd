export const TRANSACTION_REMARKS = [
  { id: "remark", label: "Remark" },
  { id: "return", label: "Return" },
  { id: "promo_copies", label: "Promo copies" },
];

export const DEFAULT_TRANSACTION_REMARK = "remark";

export function isNotableRemark(value) {
  return value === "return" || value === "promo_copies";
}

export function remarkLabel(value) {
  const item = TRANSACTION_REMARKS.find((entry) => entry.id === value);
  return item?.label || "Remark";
}

export function cfoRemarkDisplay(value) {
  return isNotableRemark(value) ? remarkLabel(value) : "—";
}

export function remarkTagClass(value) {
  if (value === "return") return "remark-tag remark-tag--return";
  if (value === "promo_copies") return "remark-tag remark-tag--promo";
  return "remark-tag";
}
