const TRANSACTION_REMARKS = ["remark", "return", "promo_copies"];

const TRANSACTION_REMARK_LABELS = {
  remark: "Remark",
  return: "Return",
  promo_copies: "Promo copies",
};

const DEFAULT_TRANSACTION_REMARK = "remark";

function normalizeTransactionRemark(value) {
  const raw = String(value || DEFAULT_TRANSACTION_REMARK).trim().toLowerCase();
  if (TRANSACTION_REMARKS.includes(raw)) return raw;
  return DEFAULT_TRANSACTION_REMARK;
}

function transactionRemarkLabel(value) {
  const key = normalizeTransactionRemark(value);
  return TRANSACTION_REMARK_LABELS[key] || TRANSACTION_REMARK_LABELS.remark;
}

function isNotableTransactionRemark(value) {
  const key = normalizeTransactionRemark(value);
  return key === "return" || key === "promo_copies";
}

function cfoTransactionRemarkExport(value) {
  if (!isNotableTransactionRemark(value)) return "—";
  return transactionRemarkLabel(value);
}

module.exports = {
  TRANSACTION_REMARKS,
  TRANSACTION_REMARK_LABELS,
  DEFAULT_TRANSACTION_REMARK,
  normalizeTransactionRemark,
  transactionRemarkLabel,
  isNotableTransactionRemark,
  cfoTransactionRemarkExport,
};
