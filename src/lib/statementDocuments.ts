import type { PayoutStatement, PayoutStatementLine } from "@prisma/client";
import PDFDocument from "pdfkit";

type StatementWithLines = PayoutStatement & { lines: PayoutStatementLine[] };

function formatGbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Cap the itemised table in the PDF — a busy provider's monthly statement could run to hundreds
// of lines, which would need real pagination to render well. Past this, the PDF shows the
// summary only and points at the CSV export for full line-level detail.
const MAX_ITEMISED_LINES_IN_PDF = 40;

/**
 * Renders a payout statement as a PDF — functions as both a plain-English "here's what you were
 * paid" remittance advice and, since it shows the platform's VAT number/rate on the commission
 * charged, the VAT invoice for that commission (only meaningful if the platform is
 * VAT-registered — see PlatformSettings). Every figure here comes from the statement row's own
 * snapshotted fields, never a live join, so a re-download always matches what was true when the
 * statement was generated.
 */
export function generateStatementPdf(statement: StatementWithLines): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(statement.platformLegalName, { continued: false });
    doc.fontSize(10).fillColor("#555").text(statement.platformAddress);
    if (statement.platformVatNumber) {
      doc.text(`VAT registration number: ${statement.platformVatNumber}`);
    }
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor("#000").text(`Payout Statement ${statement.statementNumber}`);
    doc.fontSize(10).fillColor("#555");
    doc.text(`Statement date: ${formatDate(statement.createdAt)}`);
    doc.text(`Period covered: ${formatDate(statement.periodStart)} – ${formatDate(statement.periodEnd)}`);
    doc.text(`Status: ${statement.status}${statement.paidAt ? ` (paid ${formatDate(statement.paidAt)})` : ""}`);
    doc.moveDown(1);

    doc.fontSize(11).fillColor("#000").text("Paid to:");
    doc.fontSize(10).fillColor("#555");
    doc.text(statement.providerLegalName);
    doc.text(statement.providerAddress);
    if (statement.providerVatNumber) {
      doc.text(`VAT registration number: ${statement.providerVatNumber}`);
    }
    doc.moveDown(1.5);

    if (statement.lines.length > 0 && statement.lines.length <= MAX_ITEMISED_LINES_IN_PDF) {
      doc.fontSize(11).fillColor("#000").text("Itemised bookings");
      doc.moveDown(0.3);
      const startX = doc.x;
      // Column layout: [x offset from startX, width]. Rendered with independent doc.text() calls
      // at a shared, explicitly-tracked y — pdfkit's `continued: true` does not compose with
      // per-column `width` (a wrapped cell throws off every column after it), so each cell gets
      // its own non-continued call and the row height is measured up front instead.
      const columns: { label: string; offset: number; width: number; align?: "left" | "right" }[] = [
        { label: "Date", offset: 0, width: 75 },
        { label: "Activity", offset: 75, width: 210 },
        { label: "Child", offset: 285, width: 70 },
        { label: "Credits", offset: 355, width: 45, align: "right" },
        { label: "Amount", offset: 400, width: 65, align: "right" },
      ];

      doc.fontSize(9).fillColor("#555");
      const headerY = doc.y;
      for (const col of columns) {
        doc.text(col.label, startX + col.offset, headerY, { width: col.width, align: col.align, lineBreak: false });
      }
      doc.y = headerY + doc.heightOfString("M");
      doc.moveDown(0.4);
      doc.moveTo(startX, doc.y).lineTo(startX + 465, doc.y).strokeColor("#ddd").stroke();
      doc.moveDown(0.3);

      for (const line of statement.lines) {
        const rowValues = [
          formatDate(line.sessionStartsAt),
          line.activityTitle,
          line.childInitials,
          String(line.creditsSpent),
          formatGbp(line.amountGbp),
        ];
        const y = doc.y;
        doc.fontSize(9).fillColor("#333");
        const rowHeight = Math.max(
          ...columns.map((col, i) => doc.heightOfString(rowValues[i], { width: col.width })),
        );
        columns.forEach((col, i) => {
          doc.text(rowValues[i], startX + col.offset, y, { width: col.width, align: col.align });
        });
        doc.y = y + rowHeight + 4;
      }
      doc.moveDown(1);
    } else if (statement.lines.length > MAX_ITEMISED_LINES_IN_PDF) {
      doc
        .fontSize(9)
        .fillColor("#888")
        .text(
          `This statement covers ${statement.lines.length} bookings — download the CSV export from your Accounting page for the full itemised list.`,
        );
      doc.moveDown(1);
    }

    const summaryX = 300;
    const summaryLabelWidth = 160;
    const summaryValueWidth = 85;
    function summaryRow(label: string, value: string, bold = false) {
      const y = doc.y;
      doc.fontSize(10).fillColor(bold ? "#000" : "#333");
      if (bold) doc.font("Helvetica-Bold");
      const rowHeight = Math.max(
        doc.heightOfString(label, { width: summaryLabelWidth }),
        doc.heightOfString(value, { width: summaryValueWidth }),
      );
      doc.text(label, summaryX, y, { width: summaryLabelWidth });
      doc.text(value, summaryX + summaryLabelWidth, y, { width: summaryValueWidth, align: "right" });
      doc.y = y + rowHeight + 4;
      if (bold) doc.font("Helvetica");
    }

    summaryRow("Credits redeemed", String(statement.creditsRedeemed));
    summaryRow("Credit value", `${formatGbp(statement.creditValueGbpSnapshot)}/credit`);
    summaryRow("Gross earnings", formatGbp(statement.grossAmountGbp));
    summaryRow(`Platform commission (${statement.commissionRatePercentSnapshot}%)`, `-${formatGbp(statement.commissionAmountGbp)}`);
    if (statement.commissionVatGbp > 0) {
      summaryRow("VAT on commission", `-${formatGbp(statement.commissionVatGbp)}`);
    }
    doc.moveDown(0.3);
    doc.moveTo(summaryX, doc.y).lineTo(545, doc.y).strokeColor("#333").stroke();
    doc.moveDown(0.3);
    summaryRow("Net paid to you", formatGbp(statement.netAmountGbp), true);

    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#999")
      .text(
        "This statement is a record of amounts paid to you through the platform. Keep it with your business records — HMRC requires most businesses to retain income records for at least 5 years after the 31 January Self Assessment deadline they relate to. This document is not tax advice.",
        50,
        doc.y,
        { width: 495 },
      );

    doc.end();
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildStatementsCsv(statements: PayoutStatement[]): string {
  const header = [
    "Statement Number",
    "Period Start",
    "Period End",
    "Credits Redeemed",
    "Gross (GBP)",
    "Commission (GBP)",
    "VAT on Commission (GBP)",
    "Net Paid (GBP)",
    "Status",
    "Paid At",
  ];

  const rows = statements.map((s) =>
    [
      s.statementNumber,
      s.periodStart.toISOString().slice(0, 10),
      s.periodEnd.toISOString().slice(0, 10),
      String(s.creditsRedeemed),
      (s.grossAmountGbp / 100).toFixed(2),
      (s.commissionAmountGbp / 100).toFixed(2),
      (s.commissionVatGbp / 100).toFixed(2),
      (s.netAmountGbp / 100).toFixed(2),
      s.status,
      s.paidAt ? s.paidAt.toISOString().slice(0, 10) : "",
    ]
      .map(csvEscape)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
}

export function buildExpensesCsv(
  expenses: { category: string; description: string; amountGbp: number; incurredOn: Date }[],
): string {
  const header = ["Date", "Category", "Description", "Amount (GBP)"];
  const rows = expenses.map((e) =>
    [e.incurredOn.toISOString().slice(0, 10), e.category, e.description, (e.amountGbp / 100).toFixed(2)]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
