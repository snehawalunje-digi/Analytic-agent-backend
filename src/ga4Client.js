import { BetaAnalyticsDataClient } from "@google-analytics/data";
import fs from "fs";

const key = JSON.parse(fs.readFileSync("./service-account.json", "utf8"));

const analyticsDataClient = new BetaAnalyticsDataClient({
  credentials: key
});

export async function fetchGA4Data(startDate = "30daysAgo", endDate = "today"){
  const propertyId = process.env.GA_PROPERTY_ID;

  // 1) TOTALS (sessions, users, pageviews)
  const [totals] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "screenPageViews" },
      { name: "conversions" },
      { name: "newUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
    ]
  });

  // 2) TOP PAGES (Top 5)
  const [topPages] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [
      {
        metric: { metricName: "screenPageViews" },
        desc: true
      }
    ],
    limit: 5
  });

  // 3) DAILY TRENDS
  const [daily] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" }
    ]
  });

  return {
    totals,
    topPages,
    daily
  };
}

export async function fetchGA4CustomData({ metric, startDate, endDate, dimension, limit = 5 }) {
  const request = {
    property: `properties/${process.env.GA_PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: metric }],
  };

  if (dimension) {
    request.dimensions = [{ name: dimension }];
    request.limit = limit;
  }

  const [response] = await analyticsDataClient.runReport(request);
  return response;
}


export async function getMonthlyGA4Metrics() {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${process.env.GA_PROPERTY_ID}`,
    dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "screenPageViews" },
      { name: "conversions" },
    ],
  });

  const values = response.rows?.[0]?.metricValues || [];

  return {
    sessions: values[0]?.value || 0,
    activeUsers: values[1]?.value || 0,
    pageViews: values[2]?.value || 0,
    conversions: values[3]?.value || 0,
  };
}

export async function fetchGA4Dynamic(dateRanges, metrics, dimensions) {

  // comparison case
  if (dateRanges.length > 1) {

    const results = {};

    for (const range of dateRanges) {

      const [response] = await analyticsDataClient.runReport({
        property: `properties/${process.env.GA_PROPERTY_ID}`,

        dateRanges: [range],

        metrics: metrics.map(m => ({ name: m })),

        dimensions: dimensions.map(d => ({ name: d })),

        limit: 50,
      });

      const value =
        response.rows?.[0]?.metricValues?.[0]?.value ||
        response.totals?.[0]?.metricValues?.[0]?.value ||
        0;

      results[`${range.startDate}_to_${range.endDate}`] = Number(value);
    }

    console.log("Comparison result:", results);

    return results;
  }

  // normal single range case
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${process.env.GA_PROPERTY_ID}`,

    dateRanges: dateRanges,

    metrics: metrics.map(m => ({ name: m })),

    dimensions: dimensions.map(d => ({ name: d })),

    limit: 50,
  });

const result = [];

response.rows?.forEach(row => {
  const rowData = {};

  // dimensions
  dimensions.forEach((dim, i) => {
    rowData[dim] = row.dimensionValues[i].value;
  });

  // metrics
  metrics.forEach((metric, i) => {
    rowData[metric] = Number(row.metricValues[i].value);
  });

  result.push(rowData);
});

  return result;

    const rows = response.rows?.map(row => {
    const obj = {};

    dimensions.forEach((dim, i) => {
      obj[dim] = row.dimensionValues[i].value;
    });

    metrics.forEach((metric, i) => {
      obj[metric] = Number(row.metricValues[i].value);
    });

    return obj;
  }) || [];


  return rows;
}