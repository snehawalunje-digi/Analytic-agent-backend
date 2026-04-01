import { callLLM } from "./ai.js";

function detectMonthRange(question) {
  const months = {
    january: ["01-01","01-31"],
    february: ["02-01","02-28"],
    march: ["03-01","03-31"],
    april: ["04-01","04-30"],
    may: ["05-01","05-31"],
    june: ["06-01","06-30"],
    july: ["07-01","07-31"],
    august: ["08-01","08-31"],
    september: ["09-01","09-30"],
    october: ["10-01","10-31"],
    november: ["11-01","11-30"],
    december: ["12-01","12-31"]
  };

  const yearMatch = question.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear();
  const q = question.toLowerCase();

  for (const month in months) {
    if (q.includes(month)) {
      return [
        {
          startDate: `${year}-${months[month][0]}`,
          endDate: `${year}-${months[month][1]}`
        }
      ];
    }
  }

  return null;
}

export async function classifyQuestion(question) {
  try {
    const prompt = `
You are a GA4 analytics classifier.

Return ONLY valid JSON.

Available metrics:
- activeUsers
- sessions
- screenPageViews
- conversions
- bounceRate
- averageSessionDuration

Available dimensions:
- date
- pagePath
- sessionSource
- sessionMedium
- country
- deviceCategory

Intent types:
- overview
- trend_analysis
- comparison
- top_performers
- anomaly_detection

Rules:
- If the user asks about a specific page or URL, include "pagePath" dimension.
- If the user asks to compare time periods, include TWO dateRanges.
- If no date is mentioned, default to last 30 days.

Examples:

Question: How many views does /contact page have?
Output:
{
 "intentType": "overview",
 "metrics": ["screenPageViews"],
 "dimensions": ["pagePath"],
 "dateRanges": [
   { "startDate": "30daysAgo", "endDate": "today" }
 ]
}

Question: Compare views in January vs February
Output:
{
 "intentType": "comparison",
 "metrics": ["screenPageViews"],
 "dimensions": [],
 "dateRanges": [
   { "startDate": "2026-01-01", "endDate": "2026-01-31" },
   { "startDate": "2026-02-01", "endDate": "2026-02-28" }
 ]
}

Question:
"${question}"

Return format:
{
  "intentType": "",
  "metrics": [],
  "dimensions": [],
  "dateRanges": []
}`;

    const response = await callLLM(prompt);

    // Clean response (remove ```json if exists)
    const cleaned = response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    //detect month in question
    const monthRange = detectMonthRange(question);

    if (monthRange && parsed.dateRanges.length <= 1) {
      parsed.dateRanges = monthRange;
    }
    return parsed;

  } catch (error) {
    console.error("Classifier error:", error);
    
    // fallback safe default
    return {
      intentType: "overview",
      metrics: ["sessions", "totalUsers"],
      dimensions: []
    };
  }
}