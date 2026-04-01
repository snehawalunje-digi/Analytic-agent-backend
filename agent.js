import { getGA4Answer } from "./src/ga4Agent.js";

const question = process.argv.slice(2).join(" ");

if (!question) {
  console.log("❌ Please provide a question.\nExample:\nnode agent.js \"Give me new users count last 15 days\"");
  process.exit(1);
}

(async () => {
  try {
    const answer = await getGA4Answer(question);
    console.log("\n🤖 Answer:\n", answer);
  } catch (err) {
    console.error("❌ Agent failed:", err.message);
  }
})();