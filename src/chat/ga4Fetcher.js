import { BetaAnalyticsDataClient } from "@google-analytics/data";
import dotenv from "dotenv";

dotenv.config();

const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
key.private_key = key.private_key.replace(/\\n/g, "\n");
const client = new BetaAnalyticsDataClient({ credentials: key });
const propertyId = process.env.GA_PROPERTY_ID;

function rowsToObjects(response, dimensions, metrics) {
  return (response.rows || []).map(row => {
    const obj = {};
    dimensions.forEach((d, i) => { obj[d] = row.dimensionValues[i]?.value; });
    metrics.forEach((m, i) => { obj[m] = Number(row.metricValues[i]?.value || 0); });
    return obj;
  });
}

function buildPagePathFilter(pagePath) {
  // Normalize: strip leading slash for keyword matching, lowercase
  const raw = String(pagePath).trim();
  const lower = raw.toLowerCase();
  const bare = lower.replace(/^\/+|\/+$/g, "");

  // "home" / "homepage" / "/" → match root and any /home* variant
  if (bare === "home" || bare === "homepage" || bare === "" || raw === "/") {
    return {
      orGroup: {
        expressions: [
          { filter: { fieldName: "pagePath", stringFilter: { matchType: "EXACT", value: "/" } } },
          { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/home", caseSensitive: false } } }
        ]
      }
    };
  }

  // Multi-word phrases like "about us" → match "about" OR "about-us" OR "about_us"
  const token = bare.replace(/\s+/g, "-");
  return {
    filter: {
      fieldName: "pagePath",
      stringFilter: { matchType: "CONTAINS", value: token, caseSensitive: false }
    }
  };
}

async function runReport({ dateRange, metrics, dimensions = [], pagePath = null, limit = 50, orderByMetric = null }) {
  const req = {
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    metrics: metrics.map(name => ({ name })),
    limit
  };
  if (dimensions.length) req.dimensions = dimensions.map(name => ({ name }));
  if (pagePath) {
    req.dimensionFilter = buildPagePathFilter(pagePath);
    if (!req.dimensions?.some(d => d.name === "pagePath")) {
      req.dimensions = [...(req.dimensions || []), { name: "pagePath" }];
    }
  }
  if (orderByMetric) {
    req.orderBys = [{ metric: { metricName: orderByMetric }, desc: true }];
  }
  const [response] = await client.runReport(req);
  const dims = req.dimensions?.map(d => d.name) || [];
  const rows = rowsToObjects(response, dims, metrics);

  let totals = response.totals?.[0]
    ? Object.fromEntries(metrics.map((m, i) => [m, Number(response.totals[0].metricValues[i]?.value || 0)]))
    : null;

  // When filtering by pagePath, compute aggregate totals across matched rows
  // so the answerer has a single number (e.g. "about us page views = 1,234").
  if (pagePath && rows.length && !totals) {
    totals = {};
    for (const m of metrics) {
      totals[m] = rows.reduce((sum, r) => sum + (Number(r[m]) || 0), 0);
    }
  }

  return { rows, totals, matchedPages: pagePath ? rows.map(r => r.pagePath).filter(Boolean) : [] };
}

export async function executePlan(plan) {
  const result = {
    intent: plan.intent,
    dateRanges: plan.dateRanges,
    metrics: plan.metrics,
    dimensions: plan.dimensions,
    pagePath: plan.pagePath,
    ranges: [],
    breakdowns: null
  };

  const rangeTasks = plan.dateRanges.map(async (range) => {
    const main = await runReport({
      dateRange: range,
      metrics: plan.metrics,
      dimensions: plan.dimensions,
      pagePath: plan.pagePath,
      orderByMetric: plan.dimensions.length ? plan.metrics[0] : null,
      limit: plan.intent === "top_performers" ? 10 : 50
    });
    return { range, ...main };
  });

  result.ranges = await Promise.all(rangeTasks);

  if (plan.needsBreakdown && plan.breakdownDims.length) {
    const breakdownRange = plan.dateRanges[0];
    const compareRange = plan.dateRanges[1] || null;
    const breakdowns = {};
    await Promise.all(plan.breakdownDims.map(async (dim) => {
      const current = await runReport({
        dateRange: breakdownRange,
        metrics: [plan.metrics[0] || "sessions"],
        dimensions: [dim],
        orderByMetric: plan.metrics[0] || "sessions",
        limit: 8
      });
      let previous = null;
      if (compareRange) {
        previous = await runReport({
          dateRange: compareRange,
          metrics: [plan.metrics[0] || "sessions"],
          dimensions: [dim],
          orderByMetric: plan.metrics[0] || "sessions",
          limit: 8
        });
      }
      breakdowns[dim] = { current: current.rows, previous: previous?.rows || null };
    }));
    result.breakdowns = breakdowns;
  }

  return result;
}