import PDFDocument from "pdfkit";
import fs from "fs";

const brand = {
  companyName: "DigitalZone",
  primaryColor: "#000000",
  logoPath: "./src/assets/Digitalzone-logo.png", // place your logo here
};

// Remove markdown formatting
function cleanMarkdown(text) {
  return text
    .replace(/\*/g, "")
}

export function createPDF(reportText, outputPath = "./analytics-report.pdf") {
  return new Promise((resolve, reject) => {
    const cleanedText = cleanMarkdown(reportText);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    if (fs.existsSync(brand.logoPath)) {
      doc.image(brand.logoPath, 50, 40, { width: 150 });
    }

    // Date (right)
    doc
      .fillColor("#000")
      .fontSize(10)
      .text(
        `Report Date: ${new Date().toLocaleDateString()}`,
        { align: "right" }
      );

    doc.moveDown(3);

    doc
      .fillColor(brand.primaryColor)
      .fontSize(18)
      .text(`GA4 Analytics Report`, { align: "center" });

    doc.moveDown(2);

    // Body text
    doc.fontSize(12).text(cleanedText, {
      align: "left"
    });
    

     // Footer (absolute position at the bottom)
    const bottomY = doc.page.height - 50;
    doc.fontSize(9).fillColor("gray");
    doc.text(`${brand.companyName} © ${new Date().getFullYear()} | All Copyrights Reserved`, 20, bottomY, {
      align: "center",
      lineBreak: false,
    });

    doc.end();

    stream.on("finish", () => resolve(outputPath));
    stream.on("error", reject);
  });
}