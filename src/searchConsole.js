import dotenv from "dotenv";
dotenv.config();

import { getSearchConsoleApi } from "./searchConsoleClient.js";

const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultDateRange() {
  const today = new Date();
  const endDate = formatDate(today);

  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const startDate = formatDate(start);

  return { startDate, endDate };
}

export async function listSearchConsoleSites(tokens, userId) {
  const api = getSearchConsoleApi(tokens, userId);
  const response = await api.sites.list();
  return response.data;
}

export async function getSearchConsoleOverview({ tokens,userId, startDate, endDate }) {
  const api = getSearchConsoleApi(tokens, userId);

  const finalRange =
    startDate && endDate ? { startDate, endDate } : getDefaultDateRange();

  const response = await api.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: finalRange.startDate,
      endDate: finalRange.endDate,
      dimensions: ["date"],
      rowLimit: 1000,
    },
  });

  const rows = response.data.rows || [];

  const totals = rows.reduce(
    (acc, row) => {
      acc.clicks += row.clicks || 0;
      acc.impressions += row.impressions || 0;
      acc.weightedCtrClicks += (row.ctr || 0) * (row.impressions || 0);
      acc.weightedPositionImpressions += (row.position || 0) * (row.impressions || 0);

      acc.daily.push({
        date: row.keys?.[0],
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
      });

      return acc;
    },
    {
      clicks: 0,
      impressions: 0,
      weightedCtrClicks: 0,
      weightedPositionImpressions: 0,
      daily: [],
    }
  );

  const avgCtr =
    totals.impressions > 0 ? totals.weightedCtrClicks / totals.impressions : 0;

  const avgPosition =
    totals.impressions > 0
      ? totals.weightedPositionImpressions / totals.impressions
      : 0;

  return {
    totals: {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: avgCtr,
      position: avgPosition,
    },
    trafficTrends: {
      dates: totals.daily.map((d) => d.date),
      clicks: totals.daily.map((d) => d.clicks),
      impressions: totals.daily.map((d) => d.impressions),
      ctr: totals.daily.map((d) => d.ctr),
      position: totals.daily.map((d) => d.position),
    },
    rawRows: totals.daily,
    dateRange: finalRange,
  };
}

export async function getSearchConsoleTopQueries({ tokens, userId, startDate, endDate }) {
  const api = getSearchConsoleApi(tokens, userId);

  const finalRange =
    startDate && endDate ? { startDate, endDate } : getDefaultDateRange();

  const response = await api.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: finalRange.startDate,
      endDate: finalRange.endDate,
      dimensions: ["query"],
      rowLimit: 10,
    },
  });

  return (response.data.rows || []).map((row) => ({
    query: row.keys?.[0] || "",
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }));
}

export async function getTopPages({ tokens, userId, startDate, endDate }) {
  const api = getSearchConsoleApi(tokens, userId);

  const response = await api.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 10,
    },
  });

  return (response.data.rows || []).map((row) => ({
    page: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

export async function getDevicePerformance({ tokens, userId,  startDate, endDate }) {
  const api = getSearchConsoleApi(tokens, userId);

  const response = await api.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["device"],
    },
  });

  return (response.data.rows || []).map((row) => ({
    device: row.keys[0], // DESKTOP, MOBILE, TABLET
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

export async function getCountryPerformance({ tokens, userId, startDate, endDate }) {
  const api = getSearchConsoleApi(tokens, userId);

  const response = await api.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["country"],
      rowLimit: 10,
    },
  });

  return (response.data.rows || []).map((row) => ({
    country: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

export async function getQueryPagePerformance({ tokens, userId, startDate, endDate }) {
  const api = getSearchConsoleApi(tokens, userId);

  const response = await api.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: 25,
    },
  });

  return (response.data.rows || []).map((row) => ({
    query: row.keys?.[0] || "",
    page: row.keys?.[1] || "",
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }));
}

function calculateGrowth(current, previous) {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

export async function getSearchConsoleCompare({ tokens, userId, currentStartDate, currentEndDate, previousStartDate, previousEndDate }) {
  const api = getSearchConsoleApi(tokens, userId);

  const [currentResponse, previousResponse] = await Promise.all([
    api.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: currentStartDate,
        endDate: currentEndDate,
        dimensions: ["date"],
        rowLimit: 1000,
      },
    }),
    api.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: previousStartDate,
        endDate: previousEndDate,
        dimensions: ["date"],
        rowLimit: 1000,
      },
    }),
  ]);

  const sumMetrics = (rows = []) =>
    rows.reduce(
      (acc, row) => {
        acc.clicks += row.clicks || 0;
        acc.impressions += row.impressions || 0;
        acc.ctrWeighted += (row.ctr || 0) * (row.impressions || 0);
        acc.positionWeighted += (row.position || 0) * (row.impressions || 0);
        return acc;
      },
      { clicks: 0, impressions: 0, ctrWeighted: 0, positionWeighted: 0 }
    );

  const current = sumMetrics(currentResponse.data.rows || []);
  const previous = sumMetrics(previousResponse.data.rows || []);

  const currentCtr = current.impressions ? current.ctrWeighted / current.impressions : 0;
  const previousCtr = previous.impressions ? previous.ctrWeighted / previous.impressions : 0;

  const currentPosition = current.impressions ? current.positionWeighted / current.impressions : 0;
  const previousPosition = previous.impressions ? previous.positionWeighted / previous.impressions : 0;

  return {
    current: {
      clicks: current.clicks,
      impressions: current.impressions,
      ctr: currentCtr,
      position: currentPosition,
    },
    previous: {
      clicks: previous.clicks,
      impressions: previous.impressions,
      ctr: previousCtr,
      position: previousPosition,
    },
    growth: {
      clicks: calculateGrowth(current.clicks, previous.clicks),
      impressions: calculateGrowth(current.impressions, previous.impressions),
      ctr: calculateGrowth(currentCtr, previousCtr),
      position: calculateGrowth(currentPosition, previousPosition),
    },
  };
}

export async function getLowCtrOpportunities({
  tokens,
  userId,
  startDate,
  endDate,
  minImpressions = 100,
  maxCtr = 0.02,
}) {
  const api = getSearchConsoleApi(tokens, userId);

  const response = await api.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: 250,
    },
  });

  return (response.data.rows || [])
    .map((row) => ({
      query: row.keys?.[0] || "",
      page: row.keys?.[1] || "",
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }))
    .filter((row) => row.impressions >= Number(minImpressions) && row.ctr <= Number(maxCtr))
    .sort((a, b) => b.impressions - a.impressions);
}