import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { OAuth2Client } from "google-auth-library";
import { getMonthlyGA4Metrics,fetchGA4Data,fetchGA4Dynamic } from "./ga4Client.js";
import { generateReport } from "./reportGenerator.js";
import { classifyQuestion } from "./classifier.js";
import { callLLM } from "./ai.js";
import { getInstagramOverview } from "./instagram.js";
import { captureInstagramFollowerSnapshot, getInstagramFollowerGrowth } from "./instagramFollowerJob.js";
import { getGoogleAdsOverview } from "./googleAds.js";
import { getFacebookOverview } from "./facebook.js";
import { saveUserTokens } from "./searchConsoleTokenStore.js";
import { getUserTokens } from "./searchConsoleTokenStore.js";
import { getSearchConsoleAuthUrl, exchangeCodeForTokens, } from "./searchConsoleClient.js";
import { listSearchConsoleSites, getSearchConsoleOverview, getSearchConsoleTopQueries, getTopPages, 
getDevicePerformance, getCountryPerformance, getQueryPagePerformance, getSearchConsoleCompare, getLowCtrOpportunities } from "./searchConsole.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/metrics", async (req, res) => {
  try {
    const data = await getMonthlyGA4Metrics();
    res.json(data);
  } catch (error) {
    console.error("GA4 API error:", error);
    res.status(500).json({ error: "Failed to fetch GA4 data" });
  }
});

// Download report PDF
app.get("/api/download-report", async (req, res) => {
  try {
    const { startDate = "30daysAgo", endDate = "today" } = req.query;
    const { pdfPath } = await generateReport(startDate, endDate);
    res.download(pdfPath, "analytics-ga4-report.pdf");
  } catch (error) {
    console.error("PDF generation failed:", error);
    res.status(500).json({ error: "Failed to generate report PDF" });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const { startDate = "30daysAgo", endDate = "today" } = req.query;

    const ga4Data = await fetchGA4Data(startDate, endDate);

    // DAILY TRENDS
    const dailyRows = ga4Data.daily?.rows || [];
    const daily = dailyRows.map(row => ({
      date: row.dimensionValues[0].value,
      pageViews: Number(row.metricValues[0].value),
      sessions: Number(row.metricValues[1].value),
    }));

    // TOP PAGES
    const topPageRows = ga4Data.topPages?.rows || [];
    const topPages = topPageRows.map(row => ({
      page: row.dimensionValues[0].value,
      views: Number(row.metricValues[0].value),
    }));

    // TOTALS
    const totalsRow = ga4Data.totals?.rows?.[0];
    const totals = totalsRow
      ? {
          sessions: Number(totalsRow.metricValues[0].value),
          activeUsers: Number(totalsRow.metricValues[1].value),
          pageViews: Number(totalsRow.metricValues[2].value),
          conversions: Number(totalsRow.metricValues[3].value),
        }
      : {};

    res.json({
      trafficTrends: {
        dates: daily.map(d => d.date),
        sessions: daily.map(d => d.sessions),
        pageViews: daily.map(d => d.pageViews),
      },
      topPages,
      totals,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
});

app.post("/api/ai-chat", async (req, res) => {
  try {
    const { question, startDate, endDate } = req.body;

    console.log("User question:", question);

    // STEP 1: Detect intent
    const intent = await classifyQuestion(question);

    const metrics = intent.metrics.map(m =>
      typeof m === "string" ? m : m.name
    );

    const dimensions = intent.dimensions.map(d =>
      typeof d === "string" ? d : d.name
    );

    console.log("Normalized intent:", intent);
    console.log("Normalized Metrics:", metrics);
    console.log("Normalized Dimensions:", dimensions);

    // STEP 2: Fetch GA4 dynamically
    const ga4Data = await fetchGA4Dynamic(
      intent.dateRanges,
      metrics,
      dimensions
    );

    const dateRangeText = intent.dateRanges.map(r => `${r.startDate} to ${r.endDate}`).join(" vs ");

    // STEP 3: Generate analysis
    const analysisPrompt = `
      You are a GA4 analytics assistant.
      Always answer using the analytics data provided.


      Analytics Data:
      ${JSON.stringify(ga4Data, null, 2)}

      Date Range:
      ${dateRangeText}

      Data Source:
      Google Analytics 4

      User Question:
      ${question}

      Rules:
      - Always mention the date range in the answer.
      - Always mention that the data comes from GA4.
      - Use numbers from the analytics data.
      - If no data exists, say "No data found for the selected date range."`;

    const answer = await callLLM(analysisPrompt);

    res.json({
      answer,
      intent,
      data: ga4Data
    });

  } catch (error) {
    console.error("AI Chat API error:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

app.get("/api/instagram/overview", async (req, res) => {
  try {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const [overview, followerGrowth] = await Promise.all([
      getInstagramOverview({ startDate, endDate }),
      Promise.resolve(getInstagramFollowerGrowth(startDate, endDate)),
    ]);

    res.json({
      ...overview,
      followerGrowth,
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
      details: error?.response?.data || null,
    });
  }
});

app.post("/api/instagram/followers/snapshot", async (req, res) => {
  try {
    const result = await captureInstagramFollowerSnapshot();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
      details: error?.response?.data || null,
    });
  }
});

app.get("/api/google-ads/connect", (req, res) => {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_ADS_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET,
    process.env.GOOGLE_ADS_REDIRECT_URI
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/adwords"],
  });

  res.json({ url });
});

app.get("/api/google-ads/oauth/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_ADS_CLIENT_ID,
      process.env.GOOGLE_ADS_CLIENT_SECRET,
      process.env.GOOGLE_ADS_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    console.log("🔥 NEW REFRESH TOKEN:", tokens.refresh_token);

    res.send("Google Ads connected. Check server console for refresh token.");
  } catch (error) {
    console.error("Google Ads OAuth error:", error);
    res.status(500).send("OAuth failed");
  }
});

app.get("/api/google-ads/overview", async (req, res) => {
  try {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);

    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getGoogleAdsOverview({ startDate, endDate });

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
      details: error?.response?.data || null,
    });
  }
});

app.get("/api/facebook/overview", async (req, res) => {
  try {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getFacebookOverview({ startDate, endDate });
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
      details: error?.response?.data || null,
    });
  }
});

app.get("/api/search-console/connect", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const url = getSearchConsoleAuthUrl(userId);
    res.json({ url });
  } catch (error) {
    console.error("Search Console connect error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to generate Search Console auth URL",
    });
  }
});

app.get("/api/search-console/oauth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({
        error: true,
        message: "Missing OAuth code",
      });
    }

    const userId = state || "default";
    const tokens = await exchangeCodeForTokens(code);
    await saveUserTokens(userId, tokens);

    res.send("Google Search Console connected successfully.");
  } catch (error) {
    console.error("Search Console callback error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to complete Search Console OAuth callback",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/sites", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const data = await listSearchConsoleSites(tokens, userId);
    res.json(data);
  } catch (error) {
    console.error("Search Console sites error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch Search Console sites",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/overview", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);

    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getSearchConsoleOverview({
      tokens: tokens,
      userId: userId,
      startDate,
      endDate,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console overview error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch Search Console overview",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/top-queries", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);

    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getSearchConsoleTopQueries({
      tokens: tokens,
      userId:userId,
      startDate,
      endDate,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console top queries error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch Search Console top queries",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/top-pages", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);

    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getTopPages({
      tokens: tokens,
      userId:userId,
      startDate,
      endDate,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console top pages error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch Search Console top pages",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/devices", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);

    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getDevicePerformance({
      tokens: tokens,
      userId:userId,
      startDate,
      endDate,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console device performance error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch Search Console device performance",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/countries", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);

    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getCountryPerformance({
      tokens: tokens,
      userId:userId,
      startDate,
      endDate,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console countries performance error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch Search Console countries performance",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/query-pages", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;

    const data = await getQueryPagePerformance({
      tokens,
      userId,
      startDate,
      endDate,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console query-pages error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch query page performance",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/compare", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const {
      currentStartDate,
      currentEndDate,
      previousStartDate,
      previousEndDate,
    } = req.query;

    const data = await getSearchConsoleCompare({
      tokens,
      userId,
      currentStartDate,
      currentEndDate,
      previousStartDate,
      previousEndDate,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console compare error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch compare data",
      details: error?.response?.data || error.message,
    });
  }
});

app.get("/api/search-console/low-ctr", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const tokens = getUserTokens(userId);

    if (!tokens) {
      return res.status(401).json({
        error: true,
        message: "Search Console not connected yet",
      });
    }

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    const defaultStart = start.toISOString().slice(0, 10);

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;
    const minImpressions = req.query.minImpressions || 100;
    const maxCtr = req.query.maxCtr || 0.02;

    const data = await getLowCtrOpportunities({
      tokens,
      userId,
      startDate,
      endDate,
      minImpressions,
      maxCtr,
    });

    res.json(data);
  } catch (error) {
    console.error("Search Console low-ctr error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch low CTR opportunities",
      details: error?.response?.data || error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

captureInstagramFollowerSnapshot().catch((err) => {
  console.error("Instagram follower snapshot failed:", err.message);
});