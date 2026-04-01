import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function summarizeGA4(ga4Data) {
  const prompt = `
You are a marketing analyst. Create a monthly analytics summary from this GA4 data:

GA4 Totals:
${JSON.stringify(ga4Data.totals, null, 2)}

Top 5 Pages:
${JSON.stringify(ga4Data.topPages, null, 2)}

Daily Traffic:
${JSON.stringify(ga4Data.daily, null, 2)}

Write the report in this format:

1. Overview
2. Traffic Trends (include peak day / lowest day)
3. Top 5 Pages (list each page with views)
4. Recommendations
and remove the asterisk from report`;

  try {
    const chat = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "user", content: prompt }
      ]
    });

    return chat.choices[0].message.content;
  } catch (error) {
    console.error("Groq Error:", error);
    throw error;
  }
}