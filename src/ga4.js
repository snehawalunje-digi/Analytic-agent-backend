import { BetaAnalyticsDataClient } from "@google-analytics/data";
import dotenv from "dotenv";

dotenv.config();

const analyticsDataClient = new BetaAnalyticsDataClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

/**
 * Fetch last month's GA4 metrics
 */
export async function getMonthlyReport() {
  // Calculate date range (last month)
  const today = new Date();
  const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toISOString()
    .split("T")[0];

  const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
    .toISOString()
    .split("T")[0];

  try {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${process.env.GA_PROPERTY_ID}`,
      dateRanges: [
        {
          startDate: firstDayLastMonth,
          endDate: lastDayLastMonth,
        },
      ],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
      ],
      dimensions: [{ name: "pagePath" }, { name: "sessionDefaultChannelGroup" }],
    });

    return formatGA4Response(response);
  } catch (error) {
    console.error("GA4 Error:", error);
    throw error;
  }
}

/**
 * Format GA4 Response
 */
function formatGA4Response(response) {
  const rows = response.rows || [];

  let topPages = [];
  let channels = [];

  rows.forEach((row) => {
    const pagePath = row.dimensionValues[0]?.value;
    const channel = row.dimensionValues[1]?.value;
    const sessions = row.metricValues[0]?.value;
    const users = row.metricValues[1]?.value;
    const views = row.metricValues[2]?.value;

    if (pagePath) {
      topPages.push({
        pagePath,
        sessions: Number(sessions),
        users: Number(users),
        views: Number(views),
      });
    }

    if (channel) {
      channels.push({
        channel,
        sessions: Number(sessions),
        users: Number(users),
      });
    }
  });

  return {
    summary: {
      totalSessions: rows.reduce((sum, r) => sum + Number(r.metricValues[0].value), 0),
      totalUsers: rows.reduce((sum, r) => sum + Number(r.metricValues[1].value), 0),
      totalViews: rows.reduce((sum, r) => sum + Number(r.metricValues[2].value), 0),
    },
    topPages: topPages.slice(0, 10),
    channels: channels.slice(0, 10),
  };
}