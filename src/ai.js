import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function callLLM(prompt) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: "You are a helpful GA4 analytics assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  return completion.choices[0].message.content;
}