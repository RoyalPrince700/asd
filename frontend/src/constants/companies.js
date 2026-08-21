export const ACCESSIBLE_LOCATIONS = ["HO", "AK", "AB", "ED", "LA", "KA", "US", "AN", "ANX"];

export const COMPANY_OPTIONS = [
  {
    id: "accessible",
    label: "Accessible Publishers Limited (APL)",
    shortLabel: "APL",
  },
  {
    id: "trifone",
    label: "Trifone Gadgets",
    shortLabel: "Trifone Gadgets",
  },
  {
    id: "electronics",
    label: "Trifone Electronics",
    shortLabel: "Trifone Electronics",
  },
];

export const TRIFONE_ROLE_COMPANY_OPTIONS = COMPANY_OPTIONS.filter(
  (item) => item.id === "trifone" || item.id === "electronics"
);

export function isTrifoneCompany(id) {
  return id === "trifone" || id === "electronics";
}

export function isLocationlessCompany(id) {
  return isTrifoneCompany(id);
}

export function companyLabel(id, { short = false } = {}) {
  const company = COMPANY_OPTIONS.find((item) => item.id === id);
  if (!company) return id || "—";
  return short ? company.shortLabel : company.label;
}
