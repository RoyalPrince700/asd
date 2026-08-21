import { isNotableRemark, remarkLabel, remarkTagClass } from "../constants/transactionRemarks.js";

export function RemarkTag({ value }) {
  return <span className={remarkTagClass(value)}>{remarkLabel(value)}</span>;
}

export function CfoRemarkTag({ value }) {
  if (!isNotableRemark(value)) {
    return <span className="hint">—</span>;
  }

  return <span className={remarkTagClass(value)}>{remarkLabel(value)}</span>;
}
