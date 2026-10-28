const DeletionLog = require("../models/DeletionLog");
const PressDeletionLog = require("../models/PressDeletionLog");
const { COMPANIES } = require("../constants/companies");

function snapshotDeletedRecord(record, deletedBy) {
  return {
    recordId: record._id,
    stockId: record.stockId || "",
    productName: record.productName,
    company: record.company,
    location: record.location || null,
    date: record.date,
    openingBalance: record.openingBalance,
    inbound: record.inbound,
    outbound: record.outbound,
    remark: record.remark,
    stockReceived: record.stockReceived || 0,
    stockOut: record.stockOut || 0,
    closingBalance: record.closingBalance,
    enteredBy: record.enteredBy,
    deletedBy,
  };
}

async function logRecordDeletion(record, deletedBy, { press = false } = {}) {
  const deletionLog = await DeletionLog.create(snapshotDeletedRecord(record, deletedBy));
  let pressLog = null;

  if (press) {
    try {
      pressLog = await PressDeletionLog.create({
        recordId: record._id,
        stockId: record.stockId || "",
        productName: record.productName,
        date: record.date,
        openingBalance: record.openingBalance,
        inbound: record.inbound,
        outbound: record.outbound,
        remark: record.remark,
        closingBalance: record.closingBalance,
        enteredBy: record.enteredBy,
        deletedBy,
      });
    } catch (err) {
      await deletionLog.deleteOne();
      throw err;
    }
  }

  return { deletionLog, pressLog };
}

async function rollbackDeletionLogs({ deletionLog, pressLog } = {}) {
  if (pressLog) await pressLog.deleteOne().catch(() => {});
  if (deletionLog) await deletionLog.deleteOne().catch(() => {});
}

async function logRecordDeletions(records, deletedBy) {
  if (!records.length) return;
  const docs = records.map((record) => snapshotDeletedRecord(record, deletedBy));
  const chunkSize = 500;
  for (let i = 0; i < docs.length; i += chunkSize) {
    await DeletionLog.insertMany(docs.slice(i, i + chunkSize));
  }
}

async function backfillPressDeletionLogs() {
  const pressLogs = await PressDeletionLog.find()
    .select(
      "recordId stockId productName date openingBalance inbound outbound remark closingBalance enteredBy deletedBy createdAt updatedAt"
    )
    .lean();
  if (!pressLogs.length) return { copied: 0 };

  const existing = await DeletionLog.find({
    recordId: { $in: pressLogs.map((row) => row.recordId) },
  }).distinct("recordId");
  const have = new Set(existing.map((id) => String(id)));
  const missing = pressLogs.filter((row) => !have.has(String(row.recordId)));
  if (!missing.length) return { copied: 0 };

  const docs = missing.map((row) => ({
    recordId: row.recordId,
    stockId: row.stockId || "",
    productName: row.productName,
    company: COMPANIES.PRESS,
    location: null,
    date: row.date,
    openingBalance: row.openingBalance,
    inbound: row.inbound,
    outbound: row.outbound,
    remark: row.remark,
    stockReceived: 0,
    stockOut: 0,
    closingBalance: row.closingBalance,
    enteredBy: row.enteredBy,
    deletedBy: row.deletedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt,
  }));

  try {
    await DeletionLog.collection.insertMany(docs, { ordered: false });
  } catch (err) {
    if (err.code !== 11000 && !err.writeErrors) throw err;
  }

  return { copied: docs.length };
}

module.exports = {
  logRecordDeletion,
  rollbackDeletionLogs,
  logRecordDeletions,
  backfillPressDeletionLogs,
};
