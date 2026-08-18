const Product = require("../models/Product");
const StockRecord = require("../models/StockRecord");
const {
  COMPANIES,
  ACCESSIBLE_LOCATIONS,
  companyLabel,
  emptyAccessibleStock,
  emptyTrifoneData,
} = require("../constants/companies");
const { buildMovementMap, liveAccessibleStock, liveTrifoneBalance } = require("./inventory");
const { summarizeRecords } = require("./stock");

function fmtNum(value, decimals = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtMoney(value) {
  return `₦${fmtNum(value, 0)}`;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

const LOW_STOCK_THRESHOLD = 20;
const CRITICAL_STOCK_THRESHOLD = 5;
const WATCH_STOCK_THRESHOLD = 50;

function stockStatus(totalStock) {
  if (totalStock === 0) return "outOfStock";
  if (totalStock <= CRITICAL_STOCK_THRESHOLD) return "critical";
  if (totalStock <= LOW_STOCK_THRESHOLD) return "low";
  if (totalStock <= WATCH_STOCK_THRESHOLD) return "watch";
  return "healthy";
}

function stockStatusLabel(status) {
  const labels = {
    outOfStock: "Out of stock",
    critical: "Critical (1–5)",
    low: "Low (6–20)",
    watch: "Watch (21–50)",
    healthy: "Healthy (50+)",
  };
  return labels[status] || status;
}

function truncateName(name, max = 28) {
  const text = String(name || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function aggregateAplMovement(records) {
  const byProduct = new Map();

  for (const record of records) {
    const current = byProduct.get(record.productName) || {
      productName: record.productName,
      inbound: 0,
      outbound: 0,
      stockReceived: 0,
      stockOut: 0,
      netMovement: 0,
      recordCount: 0,
      byLocation: {},
    };

    current.inbound += record.inbound || 0;
    current.outbound += record.outbound || 0;
    current.stockReceived += record.stockReceived || 0;
    current.stockOut += record.stockOut || 0;
    current.netMovement +=
      (record.inbound || 0) +
      (record.stockReceived || 0) -
      (record.outbound || 0) -
      (record.stockOut || 0);
    current.recordCount += 1;

    if (record.location) {
      const loc = current.byLocation[record.location] || {
        inbound: 0,
        outbound: 0,
        netMovement: 0,
      };
      loc.inbound += record.inbound || 0;
      loc.outbound += record.outbound || 0;
      loc.netMovement +=
        (record.inbound || 0) +
        (record.stockReceived || 0) -
        (record.outbound || 0) -
        (record.stockOut || 0);
      current.byLocation[record.location] = loc;
    }

    byProduct.set(record.productName, current);
  }

  return byProduct;
}

function emptyLocations(stock) {
  return ACCESSIBLE_LOCATIONS.filter((loc) => (Number(stock[loc]) || 0) === 0);
}

function stockedLocations(stock) {
  return ACCESSIBLE_LOCATIONS.filter((loc) => (Number(stock[loc]) || 0) > 0);
}

function analyzeAccessibleProducts(products, movementMap, aplRecords = []) {
  const movementByProduct = aggregateAplMovement(aplRecords);
  const byLocation = Object.fromEntries(ACCESSIBLE_LOCATIONS.map((loc) => [loc, 0]));
  const productRows = [];
  let totalStockUnits = 0;

  const healthCounts = {
    outOfStock: 0,
    critical: 0,
    low: 0,
    watch: 0,
    healthy: 0,
  };

  for (const product of products) {
    const { stock, allTotal } = liveAccessibleStock(product, movementMap);
    const movement = movementByProduct.get(product.name) || {
      inbound: 0,
      outbound: 0,
      stockReceived: 0,
      stockOut: 0,
      netMovement: 0,
      recordCount: 0,
      byLocation: {},
    };

    totalStockUnits += allTotal;
    const status = stockStatus(allTotal);
    healthCounts[status] += 1;

    for (const loc of ACCESSIBLE_LOCATIONS) {
      byLocation[loc] += Number(stock[loc]) || 0;
    }

    const turnoverRate =
      allTotal > 0
        ? Math.round((movement.outbound / allTotal) * 1000) / 10
        : movement.outbound > 0
          ? 100
          : 0;

    productRows.push({
      name: product.name,
      totalStock: allTotal,
      stock,
      emptyAt: emptyLocations(stock),
      stockedAt: stockedLocations(stock),
      locationCount: stockedLocations(stock).length,
      inbound: movement.inbound,
      outbound: movement.outbound,
      netMovement: movement.netMovement,
      recordCount: movement.recordCount,
      turnoverRate,
      status,
    });
  }

  productRows.sort((a, b) => b.totalStock - a.totalStock);

  const byLocationChart = ACCESSIBLE_LOCATIONS.map((location) => ({
    location,
    units: byLocation[location],
    share: pct(byLocation[location], totalStockUnits),
  })).filter((row) => row.units > 0);

  const topProducts = productRows.slice(0, 10).map((row) => ({
    name: truncateName(row.name),
    fullName: row.name,
    totalStock: row.totalStock,
  }));

  const topPerformers = [...productRows]
    .filter((row) => row.outbound > 0)
    .sort((a, b) => b.outbound - a.outbound)
    .slice(0, 12)
    .map((row) => ({
      name: truncateName(row.name, 26),
      fullName: row.name,
      outbound: row.outbound,
      inbound: row.inbound,
      totalStock: row.totalStock,
      turnoverRate: row.turnoverRate,
    }));

  const topByTurnover = [...productRows]
    .filter((row) => row.outbound > 0 && row.totalStock > 0)
    .sort((a, b) => b.turnoverRate - a.turnoverRate)
    .slice(0, 10)
    .map((row) => ({
      name: truncateName(row.name, 24),
      fullName: row.name,
      turnoverRate: row.turnoverRate,
      outbound: row.outbound,
      totalStock: row.totalStock,
    }));

  const outOfStockItems = productRows
    .filter((row) => row.status === "outOfStock")
    .sort((a, b) => b.outbound - a.outbound)
    .slice(0, 50)
    .map((row) => ({
      name: row.name,
      outbound: row.outbound,
      lastDemand: row.outbound > 0 ? "Had movement" : "No movement",
    }));

  const criticalStock = productRows
    .filter((row) => row.status === "critical")
    .sort((a, b) => a.totalStock - b.totalStock)
    .slice(0, 30)
    .map((row) => ({
      name: row.name,
      totalStock: row.totalStock,
      outbound: row.outbound,
      stockedAt: row.stockedAt,
      emptyAt: row.emptyAt,
    }));

  const lowStock = productRows
    .filter((row) => row.status === "low")
    .sort((a, b) => a.totalStock - b.totalStock)
    .slice(0, 30)
    .map((row) => ({
      name: row.name,
      totalStock: row.totalStock,
      outbound: row.outbound,
      stockedAt: row.stockedAt,
    }));

  const watchStock = productRows
    .filter((row) => row.status === "watch")
    .sort((a, b) => a.totalStock - b.totalStock)
    .slice(0, 20)
    .map((row) => ({
      name: row.name,
      totalStock: row.totalStock,
      outbound: row.outbound,
    }));

  const restockAlerts = productRows
    .filter((row) => row.outbound > 0 && row.totalStock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => b.outbound - a.outbound)
    .slice(0, 20)
    .map((row) => ({
      name: row.name,
      totalStock: row.totalStock,
      outbound: row.outbound,
      turnoverRate: row.turnoverRate,
      emptyAt: row.emptyAt,
      priority: row.totalStock === 0 ? "urgent" : row.totalStock <= CRITICAL_STOCK_THRESHOLD ? "high" : "medium",
    }));

  const slowMovers = productRows
    .filter((row) => row.totalStock > WATCH_STOCK_THRESHOLD && row.outbound === 0)
    .sort((a, b) => b.totalStock - a.totalStock)
    .slice(0, 15)
    .map((row) => ({
      name: row.name,
      totalStock: row.totalStock,
      locationCount: row.locationCount,
    }));

  const locationLowStock = ACCESSIBLE_LOCATIONS.map((location) => {
    const titles = productRows.filter((row) => {
      const units = Number(row.stock[location]) || 0;
      return units > 0 && units <= LOW_STOCK_THRESHOLD;
    });
    return {
      location,
      count: titles.length,
      titles: titles
        .sort(
          (a, b) =>
            (Number(a.stock[location]) || 0) - (Number(b.stock[location]) || 0)
        )
        .slice(0, 5)
        .map((row) => ({
          name: truncateName(row.name, 22),
          fullName: row.name,
          units: Number(row.stock[location]) || 0,
        })),
    };
  }).filter((row) => row.count > 0);

  const stockHealth = Object.entries(healthCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      status,
      label: stockStatusLabel(status),
      count,
      share: pct(count, products.length),
    }));

  const performerChart = topPerformers.slice(0, 8).map((row) => ({
    name: row.name,
    outbound: row.outbound,
    inbound: row.inbound,
  }));

  const dominantLocation = byLocationChart.reduce(
    (best, row) => (row.units > (best?.units || 0) ? row : best),
    null
  );

  const activeTitles = productRows.filter((row) => row.recordCount > 0).length;
  const totalOutbound = productRows.reduce((sum, row) => sum + row.outbound, 0);
  const totalInbound = productRows.reduce((sum, row) => sum + row.inbound, 0);

  return {
    summary: {
      totalProducts: products.length,
      totalStockUnits,
      outOfStock: healthCounts.outOfStock,
      criticalStockCount: healthCounts.critical,
      lowStockCount: healthCounts.low,
      watchStockCount: healthCounts.watch,
      healthyCount: healthCounts.healthy,
      restockAlertCount: restockAlerts.length,
      slowMoverCount: slowMovers.length,
      activeTitles,
      totalOutbound,
      totalInbound,
      dominantLocation: dominantLocation?.location || null,
      dominantLocationShare: dominantLocation?.share || 0,
    },
    byLocation: byLocationChart,
    topProducts,
    topPerformers,
    topByTurnover,
    outOfStockItems,
    criticalStock,
    lowStock,
    watchStock,
    restockAlerts,
    slowMovers,
    locationLowStock,
    stockHealth,
    performerChart,
  };
}

function analyzeTrifoneProducts(products, movementMap) {
  const productRows = [];

  for (const product of products) {
    const data = product.trifoneData?.toObject?.() || product.trifoneData || emptyTrifoneData();
    const currentStock = liveTrifoneBalance(product, movementMap);
    const unitsSold = Number(data.unitsSold) || 0;
    const costPrice = Number(data.costPrice) || 0;
    const unitPrice = Number(data.unitPrice) || 0;
    const salesRevenue = Number(data.salesRevenue) || 0;
    const stockValueOnHand = Number(data.stockValueOnHand) || 0;
    const maintenanceValue = Number(data.maintenanceValue) || 0;
    const returnValue = Number(data.returnValue) || 0;
    const totalMaint = Number(data.totalMaint) || 0;
    const returns = Number(data.returns) || 0;
    const effectiveRevenue =
      salesRevenue > 0 ? salesRevenue : unitPrice > 0 ? unitPrice * unitsSold : 0;
    const costOfGoods = costPrice * unitsSold;
    const grossProfit = effectiveRevenue > 0 ? effectiveRevenue - costOfGoods : -costOfGoods;
    const grossMarginPct =
      effectiveRevenue > 0 ? pct(effectiveRevenue - costOfGoods, effectiveRevenue) : 0;
    const unitMargin = unitPrice - costPrice;

    productRows.push({
      name: product.name,
      currentStock,
      unitsSold,
      costPrice,
      unitPrice,
      salesRevenue: effectiveRevenue,
      stockValueOnHand,
      maintenanceValue,
      returnValue,
      totalMaint,
      returns,
      costOfGoods,
      grossProfit,
      grossMarginPct,
      unitMargin,
      remarks: data.remarks || "",
    });
  }

  productRows.sort((a, b) => b.salesRevenue - a.salesRevenue);

  const totals = productRows.reduce(
    (acc, row) => {
      acc.totalSalesRevenue += row.salesRevenue;
      acc.totalStockValue += row.stockValueOnHand;
      acc.totalMaintenanceValue += row.maintenanceValue;
      acc.totalReturnValue += row.returnValue;
      acc.totalUnitsSold += row.unitsSold;
      acc.totalCurrentStock += row.currentStock;
      acc.totalCostOfGoods += row.costOfGoods;
      acc.totalGrossProfit += row.grossProfit;
      acc.totalMaintUnits += row.totalMaint;
      acc.totalReturns += row.returns;
      if (row.currentStock === 0) acc.outOfStock += 1;
      if (row.grossMarginPct > 0) {
        acc.marginSum += row.grossMarginPct;
        acc.marginCount += 1;
      }
      return acc;
    },
    {
      totalSalesRevenue: 0,
      totalStockValue: 0,
      totalMaintenanceValue: 0,
      totalReturnValue: 0,
      totalUnitsSold: 0,
      totalCurrentStock: 0,
      totalCostOfGoods: 0,
      totalGrossProfit: 0,
      totalMaintUnits: 0,
      totalReturns: 0,
      outOfStock: 0,
      marginSum: 0,
      marginCount: 0,
    }
  );

  totals.avgGrossMarginPct =
    totals.marginCount > 0
      ? Math.round((totals.marginSum / totals.marginCount) * 10) / 10
      : 0;
  totals.portfolioGrossMarginPct = pct(totals.totalGrossProfit, totals.totalSalesRevenue);

  const topByRevenue = productRows.slice(0, 10).map((row) => ({
    name: row.name.length > 24 ? `${row.name.slice(0, 22)}…` : row.name,
    fullName: row.name,
    salesRevenue: row.salesRevenue,
    unitsSold: row.unitsSold,
  }));

  const topByStockValue = [...productRows]
    .sort((a, b) => b.stockValueOnHand - a.stockValueOnHand)
    .slice(0, 10)
    .map((row) => ({
      name: row.name.length > 24 ? `${row.name.slice(0, 22)}…` : row.name,
      fullName: row.name,
      stockValueOnHand: row.stockValueOnHand,
      currentStock: row.currentStock,
    }));

  const marginLeaders = [...productRows]
    .filter((row) => row.salesRevenue > 0)
    .sort((a, b) => b.grossMarginPct - a.grossMarginPct)
    .slice(0, 8)
    .map((row) => ({
      name: row.name,
      grossMarginPct: row.grossMarginPct,
      grossProfit: row.grossProfit,
      salesRevenue: row.salesRevenue,
    }));

  const financialOverview = [
    { metric: "Sales revenue", value: totals.totalSalesRevenue },
    { metric: "Cost of goods", value: totals.totalCostOfGoods },
    { metric: "Stock on hand", value: totals.totalStockValue },
    { metric: "Maintenance", value: totals.totalMaintenanceValue },
    { metric: "Returns", value: totals.totalReturnValue },
  ].filter((row) => row.value > 0);

  const outOfStockItems = productRows
    .filter((row) => row.currentStock === 0)
    .slice(0, 12)
    .map((row) => ({
      name: row.name,
      remarks: row.remarks,
    }));

  const topByUnitsSold = [...productRows]
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10)
    .map((row) => ({
      name: row.name.length > 24 ? `${row.name.slice(0, 22)}…` : row.name,
      fullName: row.name,
      unitsSold: row.unitsSold,
      costOfGoods: row.costOfGoods,
    }));

  const topByMaintenance = [...productRows]
    .filter((row) => row.maintenanceValue > 0)
    .sort((a, b) => b.maintenanceValue - a.maintenanceValue)
    .slice(0, 10)
    .map((row) => ({
      name: row.name.length > 24 ? `${row.name.slice(0, 22)}…` : row.name,
      fullName: row.name,
      maintenanceValue: row.maintenanceValue,
      totalMaint: row.totalMaint,
    }));

  return {
    summary: {
      totalProducts: products.length,
      ...totals,
    },
    topByRevenue,
    topByUnitsSold,
    topByMaintenance,
    topByStockValue,
    marginLeaders,
    financialOverview,
    outOfStockItems,
    productRows: productRows.slice(0, 20),
  };
}

function buildMarkdown({ accessible, trifone, movement, generatedAt, companyFilter }) {
  const lines = [];
  const stamp = generatedAt.slice(0, 10);
  const scope =
    companyFilter === "all"
      ? "Group (APL + Trifone)"
      : companyLabel(companyFilter, { short: true });

  lines.push(`# CFO Financial Analysis — ${scope}`);
  lines.push("");
  lines.push(`**Report date:** ${stamp}`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");

  if (!companyFilter || companyFilter === "all" || companyFilter === COMPANIES.ACCESSIBLE) {
    const apl = accessible.summary;
    lines.push(`### ${companyLabel(COMPANIES.ACCESSIBLE)} (APL)`);
    lines.push("");
    lines.push(`- **Catalogue size:** ${fmtNum(apl.totalProducts)} book titles`);
    lines.push(`- **Total stock units:** ${fmtNum(apl.totalStockUnits)} across 9 locations`);
    if (apl.dominantLocation) {
      lines.push(
        `- **Largest hub:** ${apl.dominantLocation} holds ${apl.dominantLocationShare}% of group APL stock`
      );
    }
    lines.push(`- **Out of stock titles:** ${fmtNum(apl.outOfStock)}`);
    lines.push(`- **Critical stock (1–5 units):** ${fmtNum(apl.criticalStockCount)} titles`);
    lines.push(`- **Low stock (6–20 units):** ${fmtNum(apl.lowStockCount)} titles`);
    lines.push(`- **Restock alerts (demand + low stock):** ${fmtNum(apl.restockAlertCount)} titles`);
    lines.push(`- **Active titles (ledger movement):** ${fmtNum(apl.activeTitles)}`);
    lines.push(`- **Total outbound (period):** ${fmtNum(apl.totalOutbound)} | **Inbound:** ${fmtNum(apl.totalInbound)}`);
    lines.push(`- **Slow movers (50+ units, no sales):** ${fmtNum(apl.slowMoverCount)} titles`);
    lines.push("");
  }

  if (!companyFilter || companyFilter === "all" || companyFilter === COMPANIES.TRIFONE) {
    const trf = trifone.summary;
    lines.push(`### ${companyLabel(COMPANIES.TRIFONE)}`);
    lines.push("");
    lines.push(`- **Catalogue size:** ${fmtNum(trf.totalProducts)} device SKUs`);
    lines.push(`- **Sales revenue (August register):** ${fmtMoney(trf.totalSalesRevenue)}`);
    lines.push(`- **Stock value on hand:** ${fmtMoney(trf.totalStockValue)}`);
    lines.push(`- **Gross profit:** ${fmtMoney(trf.totalGrossProfit)} (${trf.portfolioGrossMarginPct}% margin)`);
    lines.push(`- **Maintenance exposure:** ${fmtMoney(trf.totalMaintenanceValue)} (${fmtNum(trf.totalMaintUnits)} units)`);
    lines.push(`- **Return value:** ${fmtMoney(trf.totalReturnValue)}`);
    lines.push(`- **Units sold:** ${fmtNum(trf.totalUnitsSold)} | **Current stock:** ${fmtNum(trf.totalCurrentStock)}`);
    lines.push(`- **Cost of goods sold:** ${fmtMoney(trf.totalCostOfGoods)}`);
    lines.push(`- **Out of stock SKUs:** ${fmtNum(trf.outOfStock)}`);
    lines.push("");
  }

  if (movement?.totals?.recordCount) {
    lines.push("### Ledger movement (filtered period)");
    lines.push("");
    lines.push(`- **Records posted:** ${fmtNum(movement.totals.recordCount)}`);
    lines.push(`- **Inbound:** ${fmtNum(movement.totals.inbound)} | **Outbound:** ${fmtNum(movement.totals.outbound)}`);
    lines.push(`- **Net movement:** ${fmtNum(movement.totals.netMovement)}`);
    lines.push("");
  }

  if (!companyFilter || companyFilter === "all" || companyFilter === COMPANIES.ACCESSIBLE) {
    lines.push(`## ${companyLabel(COMPANIES.ACCESSIBLE)} — location breakdown`);
    lines.push("");
    lines.push("| Location | Units | Share |");
    lines.push("| --- | ---: | ---: |");
    for (const row of accessible.byLocation) {
      lines.push(`| ${row.location} | ${fmtNum(row.units)} | ${row.share}% |`);
    }
    lines.push("");

    if (accessible.topProducts.length) {
      lines.push("### Top titles by stock volume");
      lines.push("");
      for (const row of accessible.topProducts.slice(0, 5)) {
        lines.push(`- **${row.fullName}** — ${fmtNum(row.totalStock)} units`);
      }
      lines.push("");
    }

    if (accessible.topPerformers.length) {
      lines.push("### Best performing titles (by outbound movement)");
      lines.push("");
      lines.push("| Title | Outbound | Inbound | Stock | Turnover |");
      lines.push("| --- | ---: | ---: | ---: | ---: |");
      for (const row of accessible.topPerformers.slice(0, 10)) {
        lines.push(
          `| ${row.fullName} | ${fmtNum(row.outbound)} | ${fmtNum(row.inbound)} | ${fmtNum(row.totalStock)} | ${row.turnoverRate}% |`
        );
      }
      lines.push("");
    }

    if (accessible.restockAlerts.length) {
      lines.push("### Restock alerts — high demand, low stock");
      lines.push("");
      for (const row of accessible.restockAlerts.slice(0, 10)) {
        const locNote = row.emptyAt.length ? ` (empty at ${row.emptyAt.join(", ")})` : "";
        lines.push(
          `- **${row.name}** — ${fmtNum(row.totalStock)} units left, ${fmtNum(row.outbound)} outbound${locNote}`
        );
      }
      lines.push("");
    }

    if (accessible.outOfStockItems.length) {
      lines.push("### Out-of-stock titles");
      lines.push("");
      for (const row of accessible.outOfStockItems.slice(0, 15)) {
        const note = row.outbound > 0 ? " _(had recent demand)_" : "";
        lines.push(`- ${row.name}${note}`);
      }
      if (accessible.outOfStockItems.length > 15) {
        lines.push(`- _…and ${accessible.outOfStockItems.length - 15} more_`);
      }
      lines.push("");
    }

    if (accessible.criticalStock.length) {
      lines.push("### Critical stock (1–5 units)");
      lines.push("");
      for (const row of accessible.criticalStock.slice(0, 10)) {
        const locs = row.stockedAt.length ? row.stockedAt.join(", ") : "none";
        lines.push(`- **${row.name}** — ${fmtNum(row.totalStock)} units (${locs})`);
      }
      lines.push("");
    }

    if (accessible.lowStock.length) {
      lines.push("### Low stock (6–20 units)");
      lines.push("");
      for (const row of accessible.lowStock.slice(0, 10)) {
        lines.push(`- **${row.name}** — ${fmtNum(row.totalStock)} units, ${fmtNum(row.outbound)} outbound`);
      }
      lines.push("");
    }

    if (accessible.slowMovers.length) {
      lines.push("### Slow movers — high stock, no outbound");
      lines.push("");
      for (const row of accessible.slowMovers.slice(0, 8)) {
        lines.push(`- **${row.name}** — ${fmtNum(row.totalStock)} units across ${row.locationCount} locations`);
      }
      lines.push("");
    }
  }

  if (!companyFilter || companyFilter === "all" || companyFilter === COMPANIES.TRIFONE) {
    lines.push(`## ${companyLabel(COMPANIES.TRIFONE)} — revenue & margin`);
    lines.push("");
    lines.push("| SKU | Revenue | Units sold |");
    lines.push("| --- | ---: | ---: |");
    for (const row of trifone.topByRevenue.slice(0, 8)) {
      lines.push(`| ${row.fullName} | ${fmtMoney(row.salesRevenue)} | ${fmtNum(row.unitsSold)} |`);
    }
    lines.push("");

    if (trifone.marginLeaders.length) {
      lines.push("### Highest margin performers");
      lines.push("");
      for (const row of trifone.marginLeaders.slice(0, 5)) {
        lines.push(
          `- **${row.name}** — ${row.grossMarginPct}% margin (${fmtMoney(row.grossProfit)} on ${fmtMoney(row.salesRevenue)})`
        );
      }
      lines.push("");
    }

    if (trifone.topByUnitsSold.length) {
      lines.push("### Top SKUs by units sold");
      lines.push("");
      for (const row of trifone.topByUnitsSold.slice(0, 5)) {
        lines.push(
          `- **${row.fullName}** — ${fmtNum(row.unitsSold)} units (COGS ${fmtMoney(row.costOfGoods)})`
        );
      }
      lines.push("");
    }

    if (trifone.topByMaintenance.length) {
      lines.push("### Maintenance exposure by SKU");
      lines.push("");
      for (const row of trifone.topByMaintenance.slice(0, 5)) {
        lines.push(
          `- **${row.fullName}** — ${fmtMoney(row.maintenanceValue)} (${fmtNum(row.totalMaint)} units in maintenance)`
        );
      }
      lines.push("");
    }

    if (trifone.outOfStockItems.length) {
      lines.push("### Out-of-stock SKUs");
      lines.push("");
      for (const row of trifone.outOfStockItems) {
        const note = row.remarks ? ` — _${row.remarks}_` : "";
        lines.push(`- ${row.name}${note}`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("_Generated by Accessible Stock Dashboard CFO Analysis._");

  return lines.join("\n");
}

async function buildAnalysis(query = {}) {
  const companyFilter = query.company
    ? String(query.company).trim().toLowerCase()
    : "all";

  const recordFilter = {};
  if (query.from || query.to) {
    recordFilter.date = {};
    if (query.from) recordFilter.date.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      recordFilter.date.$lte = to;
    }
  }
  if (companyFilter !== "all") {
    recordFilter.company = companyFilter;
  }

  const [aplProducts, trifoneProducts, records] = await Promise.all([
    companyFilter === "all" || companyFilter === COMPANIES.ACCESSIBLE
      ? Product.find({ company: COMPANIES.ACCESSIBLE }).sort({ name: 1 })
      : [],
    companyFilter === "all" || companyFilter === COMPANIES.TRIFONE
      ? Product.find({ company: COMPANIES.TRIFONE }).sort({ name: 1 })
      : [],
    StockRecord.find(recordFilter).sort({ date: -1 }),
  ]);

  const [aplMovementMap, trifoneMovementMap] = await Promise.all([
    aplProducts.length ? buildMovementMap(COMPANIES.ACCESSIBLE) : new Map(),
    trifoneProducts.length ? buildMovementMap(COMPANIES.TRIFONE) : new Map(),
  ]);

  const aplRecords = records.filter((row) => row.company === COMPANIES.ACCESSIBLE);

  const accessible = analyzeAccessibleProducts(aplProducts, aplMovementMap, aplRecords);
  const trifone = analyzeTrifoneProducts(trifoneProducts, trifoneMovementMap);
  const movement = summarizeRecords(records);

  const movementByCompany = movement.byCompany.map((row) => ({
    ...row,
    label: companyLabel(row.company, { short: true }),
  }));

  const generatedAt = new Date().toISOString();
  const markdown = buildMarkdown({
    accessible,
    trifone,
    movement,
    generatedAt,
    companyFilter,
  });

  return {
    generatedAt,
    company: companyFilter,
    accessible,
    trifone,
    movement: {
      totals: movement.totals,
      byCompany: movementByCompany,
      byDate: movement.byDate,
    },
    markdown,
  };
}

module.exports = { buildAnalysis, fmtNum, fmtMoney };
