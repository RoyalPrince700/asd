const COMPANIES = {
  ACCESSIBLE: "accessible",
  TRIFONE: "trifone",
  ELECTRONICS: "electronics",
};

const COMPANY_LABELS = {
  [COMPANIES.ACCESSIBLE]: "Accessible Publishers Limited",
  [COMPANIES.TRIFONE]: "Trifone Gadgets",
  [COMPANIES.ELECTRONICS]: "Trifone Electronics",
};

const COMPANY_SHORT_LABELS = {
  [COMPANIES.ACCESSIBLE]: "APL",
  [COMPANIES.TRIFONE]: "Trifone Gadgets",
  [COMPANIES.ELECTRONICS]: "Trifone Electronics",
};

const COMPANY_OPTIONS = [
  {
    id: COMPANIES.ACCESSIBLE,
    label: "Accessible Publishers Limited (APL)",
    shortLabel: "APL",
  },
  {
    id: COMPANIES.TRIFONE,
    label: "Trifone Gadgets",
    shortLabel: "Trifone Gadgets",
  },
  {
    id: COMPANIES.ELECTRONICS,
    label: "Trifone Electronics",
    shortLabel: "Trifone Electronics",
  },
];

function isLocationlessCompany(value) {
  const company = String(value || "").trim().toLowerCase();
  return company === COMPANIES.TRIFONE || company === COMPANIES.ELECTRONICS;
}

function isValidCompany(value) {
  return Object.values(COMPANIES).includes(String(value || "").trim().toLowerCase());
}

function resolveCompany(value) {
  const company = String(value || "").trim().toLowerCase();
  return isValidCompany(company) ? company : null;
}

function companyLabel(company, { short = false } = {}) {
  if (short) return COMPANY_SHORT_LABELS[company] || company;
  return COMPANY_LABELS[company] || company;
}

const ACCESSIBLE_LOCATIONS = ["HO", "AK", "AB", "ED", "LA", "KA", "US", "AN", "ANX"];

const SKIP_HEADERS = /^sale\s*price$|^all\s*total$|^total$/i;

const TRIFONE_AUGUST_FIELDS = [
  { key: "openingStock2Aug", label: "Opening Stock (2/8/2026)", type: "count" },
  { key: "openingStock9Aug", label: "Opening Stock (9/8/2026)", type: "count" },
  { key: "openingStock16Aug", label: "Opening Stock (16/8/2026)", type: "count" },
  { key: "restock2Aug", label: "Restock (2/8/2026)", type: "count" },
  { key: "currentStock", label: "Current Stock", type: "count" },
  { key: "unitsInMaint", label: "Units in Maint.", type: "count" },
  { key: "unitsInMaint3Aug", label: "Units in Maint. (3/8/2026)", type: "count" },
  { key: "totalMaint", label: "Total Maint.", type: "count" },
  { key: "returns", label: "Returns", type: "count" },
  { key: "maintenanceValue", label: "Maintenance Value (₦)", type: "money" },
  { key: "returnValue", label: "Return Value", type: "money" },
  { key: "unitsSold", label: "Units Sold", type: "count" },
  { key: "costPrice", label: "Cost Price (₦)", type: "money" },
  { key: "unitPrice", label: "Unit Price (₦)", type: "money" },
  { key: "salesRevenue", label: "Sales Revenue (₦)", type: "money" },
  { key: "stockValueOnHand", label: "Stock Value on Hand (₦)", type: "money" },
  { key: "remarks", label: "Remarks", type: "text" },
];

const TRIFONE_FIELD_LOOKUP = Object.fromEntries(
  TRIFONE_AUGUST_FIELDS.map((field) => [field.key, field])
);

const TRIFONE_HEADER_PATTERNS = [
  {
    key: "openingStock2Aug",
    patterns: [/^opening\s*stock\s*\(\s*2\s*\/\s*8/i],
  },
  {
    key: "openingStock9Aug",
    patterns: [/^opening\s*stock\s*\(\s*9\s*\/\s*8/i],
  },
  {
    key: "openingStock16Aug",
    patterns: [/^opening\s*stock\s*\(\s*16\s*\/\s*8/i],
  },
  {
    key: "restock2Aug",
    patterns: [/^restock\s*\(\s*2\s*\/\s*8/i],
  },
  {
    key: "currentStock",
    patterns: [/^current\s*stock$/i],
  },
  {
    key: "unitsInMaint3Aug",
    patterns: [/^units\s*in\s*maint\.?\s*\(\s*3\s*\/\s*8/i],
  },
  {
    key: "unitsInMaint",
    patterns: [/^units\s*in\s*maint\.?$/i],
  },
  {
    key: "totalMaint",
    patterns: [/^total\s*maint\.?$/i],
  },
  {
    key: "returns",
    patterns: [/^returns$/i],
  },
  {
    key: "maintenanceValue",
    patterns: [/^maintenance\s*value/i],
  },
  {
    key: "returnValue",
    patterns: [/^return\s*value/i],
  },
  {
    key: "unitsSold",
    patterns: [/^units\s*sold$/i],
  },
  {
    key: "costPrice",
    patterns: [/^cost\s*price/i],
  },
  {
    key: "unitPrice",
    patterns: [/^unit\s*price/i],
  },
  {
    key: "salesRevenue",
    patterns: [/^sales\s*revenue/i],
  },
  {
    key: "stockValueOnHand",
    patterns: [/^stock\s*value\s*on\s*hand/i],
  },
  {
    key: "remarks",
    patterns: [/^remarks$/i],
  },
];

function emptyAccessibleStock() {
  return Object.fromEntries(ACCESSIBLE_LOCATIONS.map((loc) => [loc, 0]));
}

function emptyTrifoneData() {
  return Object.fromEntries(
    TRIFONE_AUGUST_FIELDS.map((field) => [
      field.key,
      field.type === "text" ? "" : 0,
    ])
  );
}

const ELECTRONICS_FIELDS = [
  { key: "currentStock", label: "Current Stock", type: "count" },
];

function emptyElectronicsData() {
  return { currentStock: 0 };
}

module.exports = {
  COMPANIES,
  COMPANY_LABELS,
  COMPANY_SHORT_LABELS,
  COMPANY_OPTIONS,
  isLocationlessCompany,
  isValidCompany,
  resolveCompany,
  companyLabel,
  ACCESSIBLE_LOCATIONS,
  SKIP_HEADERS,
  TRIFONE_AUGUST_FIELDS,
  TRIFONE_FIELD_LOOKUP,
  TRIFONE_HEADER_PATTERNS,
  ELECTRONICS_FIELDS,
  emptyAccessibleStock,
  emptyTrifoneData,
  emptyElectronicsData,
};
