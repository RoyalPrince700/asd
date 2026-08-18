const RecordChange = require("../models/RecordChange");

const SNAPSHOT_KEYS = [
  "productName",
  "company",
  "location",
  "date",
  "openingBalance",
  "inbound",
  "outbound",
  "stockReceived",
  "stockOut",
  "closingBalance",
];

function snapshotRecord(record) {
  const snap = {};
  for (const key of SNAPSHOT_KEYS) {
    snap[key] = record[key];
  }
  return snap;
}

function applySnapshot(record, snapshot) {
  for (const key of SNAPSHOT_KEYS) {
    record[key] = snapshot[key];
  }
}

async function findPendingChange(recordId) {
  return RecordChange.findOne({ recordId, status: "pending" });
}

async function pendingChangeMapForRecords(recordIds) {
  if (!recordIds.length) return new Map();

  const changes = await RecordChange.find({
    recordId: { $in: recordIds },
    status: "pending",
  }).select("_id recordId createdAt");

  const map = new Map();
  for (const change of changes) {
    map.set(String(change.recordId), {
      changeId: change._id,
      submittedAt: change.createdAt,
    });
  }
  return map;
}

function attachPendingMeta(records, pendingMap) {
  return records.map((record) => {
    const doc = record.toObject ? record.toObject() : { ...record };
    const pending = pendingMap.get(String(doc._id));
    if (pending) {
      doc.pendingApproval = true;
      doc.pendingChangeId = pending.changeId;
      doc.pendingSubmittedAt = pending.submittedAt;
    }
    return doc;
  });
}

module.exports = {
  SNAPSHOT_KEYS,
  snapshotRecord,
  applySnapshot,
  findPendingChange,
  pendingChangeMapForRecords,
  attachPendingMeta,
};
