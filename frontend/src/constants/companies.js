export const ACCESSIBLE_LOCATIONS = ["HO", "AK", "AB", "ED", "LA", "KA", "US", "AN", "ANX"];

export const COMPANY_OPTIONS = [
  {
    id: "accessible",
    label: "Accessible Publishers Limited (APL)",
    shortLabel: "APL",
  },
  {
    id: "trifone",
    label: "Trifone",
    shortLabel: "Trifone",
  },
];

export function companyLabel(id, { short = false } = {}) {
  const company = COMPANY_OPTIONS.find((item) => item.id === id);
  if (!company) return id || "—";
  return short ? company.shortLabel : company.label;
}
