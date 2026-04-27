import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a GA4 analytics assistant.

STRICT RULES — violating these is failure:
1. Answer ONLY using numbers present in the provided JSON data. Never invent, estimate, or round-guess figures.
2. If the data is empty or missing a metric, say so plainly ("No data for that range" / "That metric wasn't fetched"). Do NOT fabricate.
3. For "why" questions, cite specific rows from the breakdowns JSON that changed most. Prefix causal statements with "Likely:" and name the exact dimension value.
4. Format page paths readably (e.g. "/home" → "Home page") but keep the raw path in parentheses for clarity.
5. Keep responses short: 2-5 sentences or a compact bulleted list. No filler.
6. Do not mention that you are an AI, do not apologize, do not speculate.
7. For page-specific queries, sum the metric across all matched rows (the totals field is pre-aggregated). If multiple page variants matched (e.g. "/home" and "/home/"), list them briefly so the user can verify. If zero rows matched, say "No data found for that page in the selected range" and suggest the user check the exact path.`;

function truncateData(data) {
  const clone = JSON.parse(JSON.stringify(data));
  clone.ranges = clone.ranges?.map(r => ({
    range: r.range,
    totals: r.totals,
    rows: (r.rows || []).slice(0, 15)
  }));
  if (clone.breakdowns) {
    for (const dim of Object.keys(clone.breakdowns)) {
      const b = clone.breakdowns[dim];
      clone.breakdowns[dim] = {
        current: (b.current || []).slice(0, 6),
        previous: b.previous ? b.previous.slice(0, 6) : null
      };
    }
  }
  return clone;
}

export async function answerFromData(question, plan, data, history) {
  const trimmed = truncateData(data);
  const historyBlock = history?.length
    ? history.slice(-3).map(t => `Q: ${t.question}\nA: ${t.answer}`).join("\n\n")
    : "None.";

  const userPrompt = `Recent conversation:
${historyBlock}

Current question: "${question}"

Plan used: ${JSON.stringify({ intent: plan.intent, metrics: plan.metrics, dimensions: plan.dimensions, dateRanges: plan.dateRanges, pagePath: plan.pagePath })}

GA4 data (the ONLY source of truth):
${JSON.stringify(trimmed, null, 2)}

Write a grounded answer following the rules. If comparing ranges, state both numbers and the delta. If data is empty, say so.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ]
  });

  return completion.choices[0].message.content.trim();
}

export function suggestFollowUps(plan) {
  const s = new Set();
  if (plan.intent === "comparison" || plan.dateRanges.length === 2) {
    s.add("Why did it change?");
    s.add("Break down by device");
  }
  if (plan.intent !== "why_change") {
    s.add("Compare with previous period");
  }
  if (!plan.dimensions.includes("pagePath") && !plan.pagePath) {
    s.add("What are the top pages?");
  }
  s.add("Break down by source");
  return [...s].slice(0, 3);
}