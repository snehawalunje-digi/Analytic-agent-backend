import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USR,
    pass: process.env.EMAIL_PWD
  }
});

export async function sendReportEmail(pdfPath) {
  await transporter.sendMail({
    from: `"Analytics Agent" <${process.env.SENDER_EMAIL}>`,
    to: process.env.REPORT_RECIPIENT,
    subject: "Monthly GA4 Analytics Report",
    text: "Hi,\n\nPlease find attached the monthly GA4 analytics report.\n\nRegards,\nAnalytics Agent",
    attachments: [
      {
        filename: "monthly-report.pdf",
        path: pdfPath
      }
    ]
  });
  console.log("📧 Report email sent successfully");
}