import { fetchGA4Data } from "./ga4Client.js";
import { summarizeGA4 } from "./groqClient.js";
import { createPDF } from "./pdfClient.js";
import { sendReportEmail } from "./emailService.js";

export async function generateReport(startDate = "30daysAgo", endDate = "today") {
  console.log("Fetching GA4 data...");
  const ga4Data = await fetchGA4Data(startDate, endDate);

  console.log("Summarizing with Groq...");
  const summary = await summarizeGA4(ga4Data);

  console.log("\n===== MONTHLY ANALYTICS REPORT =====\n");
  console.log(summary);
  console.log("\n====================================\n");

  console.log("Creating PDF report...");
  const pdfPath = await createPDF(summary, "./analytics-report.pdf");

  console.log("PDF created successfully:", pdfPath);

  // console.log("Sending report via email...");
  // await sendReportEmail(pdfPath);

  // console.log("✅ Monthly report generated and emailed successfully");

  return { summary, pdfPath };
}