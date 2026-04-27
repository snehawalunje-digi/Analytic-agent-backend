import Groq from "groq-sdk";
import dotenv from "dotenv";
import { resolveDateRanges } from "./dateResolver.js";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callPlannerLLM(prompt) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are a strict JSON-only GA4 query planner. Output valid JSON only." },
      { role: "user", content: prompt }
    ]
  });
  return completion.choices[0].message.content;
}

const ALLOWED_METRICS = new Set([
  "sessions", "activeUsers", "totalUsers", "newUsers",
  "screenPageViews", "conversions", "bounceRate", "averageSessionDuration"
]);

const ALLOWED_DIMENSIONS = new Set([
  "date", "pagePath", "sessionSource", "sessionMedium",
  "sessionDefaultChannelGroup", "country", "deviceCategory"
]);

const ALLOWED_INTENTS = new Set([
  "overview", "trend_analysis", "comparison",
  "top_performers", "page_lookup", "why_change", "follow_up"
]);

function detectPageRef(question) {
  const q = question.toLowerCase();

  // Explicit path like /home, /about-us, /gdpr
  const pathMatch = q.match(/\/[a-z0-9][a-z0-9\-_\/]*/);
  if (pathMatch) return pathMatch[0];

  // "home page", "homepage", "home" when near page/views/visits
  if (/\b(home\s*page|homepage|home)\b/.test(q) && /\b(page|view|visit|traffic|hit)/.test(q)) {
    return "home";
  }

  // "X page" where X is a noun phrase (1-3 words)
  const phraseMatch = q.match(/\b((?:about\s*us|about|pricing|contact|blog|services?|products?|gdpr|privacy|terms|faq|login|signup|checkout|cart|support|careers?|team)(?:\s+[a-z]+)?)\s+page\b/);
  if (phraseMatch) return phraseMatch[1].trim().replace(/\s+/g, "-");

  // "for /slug" or "on /slug" already handled by path match above
  return null;
}

function buildHistoryBlock(history) {
  if (!history?.length) return "No prior turns.";
  return history
    .map((t, i) => `Turn ${i + 1}:\nUser: ${t.question}\nContext used: ${JSON.stringify(t.context || {})}`)
    .join("\n\n");
}

function validatePlan(raw) {
  const plan = {
    intent: ALLOWED_INTENTS.has(raw.intent) ? raw.intent : "overview",
    metrics: (raw.metrics || []).filter(m => ALLOWED_METRICS.has(m)),
    dimensions: (raw.dimensions || []).filter(d => ALLOWED_DIMENSIONS.has(d)),
    dateRanges: Array.isArray(raw.dateRanges) ? raw.dateRanges : [],
    pagePath: typeof raw.pagePath === "string" ? raw.pagePath : null,
    needsBreakdown: !!raw.needsBreakdown,
    breakdownDims: (raw.breakdownDims || []).filter(d => ALLOWED_DIMENSIONS.has(d))
  };
  if (!plan.metrics.length) plan.metrics = ["sessions", "activeUsers"];
  return plan;
}

export async function planQuestion(question, history, lastContext, defaultRange) {
  const prompt = `You are a GA4 query planner. Output ONLY valid JSON, no prose.

Allowed metrics: ${[...ALLOWED_METRICS].join(", ")}
Allowed dimensions: ${[...ALLOWED_DIMENSIONS].join(", ")}
Allowed intents: ${[...ALLOWED_INTENTS].join(", ")}

Conversation history (most recent last):
${buildHistoryBlock(history)}

Last resolved context: ${JSON.stringify(lastContext || {})}

Current user question: "${question}"

Rules:
- Resolve follow-ups ("why did it drop?", "compare with previous", "what about mobile?") using last context.
- For "why did it drop/change" questions, set intent="why_change", needsBreakdown=true, breakdownDims=["sessionDefaultChannelGroup","deviceCategory","country","pagePath"].
- For page-specific questions, set pagePath and include "pagePath" in dimensions. Accept BOTH explicit paths ("/home", "/gdpr", "/about-us") AND natural phrases ("home page" → "home", "about us page" → "about-us", "pricing page" → "pricing", "contact page" → "contact", "blog" → "blog"). Strip the word "page" and use a keyword or path — the backend will do a case-insensitive CONTAINS match. If the user clearly names a specific page, ALWAYS set pagePath.
- For comparisons, include TWO dateRanges.
- Leave dateRanges as [] if none mentioned — it will be filled by defaults.
- Prefer "sessions", "activeUsers", "screenPageViews", "bounceRate", "conversions" as metrics.

Output shape:
{
  "intent": "",
  "metrics": [],
  "dimensions": [],
  "dateRanges": [{"startDate":"","endDate":""}],
  "pagePath": null,
  "needsBreakdown": false,
  "breakdownDims": []
}`;

  let parsed;
  try {
    const raw = await callPlannerLLM(prompt);
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : cleaned);
  } catch (err) {
    console.error("Planner LLM error:", err.message);
    parsed = { intent: "overview", metrics: ["sessions", "activeUsers"], dimensions: [], dateRanges: [] };
  }

  const plan = validatePlan(parsed);

  // Deterministic page detection fallback — catch what the LLM missed
  if (!plan.pagePath) {
    const detected = detectPageRef(question);
    if (detected) plan.pagePath = detected;
  }
  if (plan.pagePath) {
    if (!plan.dimensions.includes("pagePath")) plan.dimensions.push("pagePath");
    // Default page questions to page views unless user asked for something else
    const wantsViews = /view|visit|traffic|hits?/i.test(question) ||
      !plan.metrics.some(m => m === "sessions" || m === "activeUsers" || m === "conversions" || m === "bounceRate");
    if (wantsViews && !plan.metrics.includes("screenPageViews")) {
      plan.metrics = ["screenPageViews", ...plan.metrics.filter(m => m !== "screenPageViews")];
    }
  }

  // Deterministic date override — trust JS over LLM
  const resolved = resolveDateRanges(question, lastContext);
  if (resolved.length) {
    plan.dateRanges = resolved;
  } else if (!plan.dateRanges.length || !plan.dateRanges[0]?.startDate) {
    plan.dateRanges = [defaultRange];
  }

  // Follow-up inheritance
  if (plan.intent === "why_change" && lastContext?.dateRanges?.length) {
    plan.dateRanges = lastContext.dateRanges;
    plan.metrics = lastContext.metrics?.length ? lastContext.metrics : plan.metrics;
    plan.needsBreakdown = true;
    if (!plan.breakdownDims.length) {
      plan.breakdownDims = ["sessionDefaultChannelGroup", "deviceCategory", "country", "pagePath"];
    }
  }

  return plan;
}