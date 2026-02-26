import { Router } from "express";
import mongoose from "mongoose";
import Survey from "../models/Survey";
import Company from "../models/Company";
import Question from "../models/Question";
import Option from "../models/Option";

// PDF
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
const router = Router();

/* ---------- helpers ---------- */
const parseSegmentNumber = (q: any): number => {
  const raw = q.segmentNumber ?? q.segmentIndex ?? q.segment ?? 1;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const m = raw.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return 1;
};

/**
 * GET /api/public/surveys/:key
 */
router.get("/surveys/:key", async (req, res, next) => {
  try {
    const { key } = req.params;

    const byId = mongoose.isValidObjectId(key)
      ? await Survey.findById(key).lean()
      : null;
    const survey = byId ?? (await Survey.findOne({ publicToken: key }).lean());
    if (!survey) return res.status(404).json({ error: "Survey not found" });

    const company = survey.companyId
      ? await Company.findById(survey.companyId).lean()
      : null;

    const qDocs = await Question.find({ surveyId: survey._id })
      .sort({ createdAt: 1 })
      .lean();

    const qIds = qDocs.map((q: any) => q._id);
    const optDocs = await Option.find({ questionId: { $in: qIds } })
      .sort({ createdAt: 1 })
      .lean();

    const optionsByQ = new Map<
      string,
      Array<{ id: string; text: string; risk?: string }>
    >();
    for (const o of optDocs as any[]) {
      const k = String(o.questionId);
      if (!optionsByQ.has(k)) optionsByQ.set(k, []);
      optionsByQ.get(k)!.push({
        id: String(o._id),
        text: String(o.text ?? ""),
        risk: (o as any).risk,
      });
    }

    const buckets = new Map<number, { title: string; questions: any[] }>();
    for (const q of qDocs as any[]) {
      const segNum = parseSegmentNumber(q);
      const segTitle = String(q.segmentTitle ?? `Segment ${segNum}`);

      const typeStr = String(q.type ?? "radio").toLowerCase();
      const type =
        typeStr === "checkbox"
          ? "checkbox"
          : typeStr === "text"
            ? "text"
            : "radio";

      const question = {
        id: String(q._id),
        text: String(q.text ?? ""),
        image: q.image,
        details: q.details,
        type,
        options: optionsByQ.get(String(q._id)) ?? [],
      };

      if (!buckets.has(segNum))
        buckets.set(segNum, { title: segTitle, questions: [] });
      buckets.get(segNum)!.questions.push(question);
    }

    const segments = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, { title, questions }]) => ({ title, questions }));

    const logoArray: string[] =
      (company as any)?.logoUrls && Array.isArray((company as any)?.logoUrls)
        ? (company as any).logoUrls
        : (company as any)?.logoUrl
          ? [(company as any).logoUrl]
          : [];

    res.json({
      companyName: String(company?.name ?? ""),
      companyLogo: logoArray[0] || undefined,
      companyLogos: logoArray,
      surveyName: String(survey.name ?? ""),
      segments,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/public/surveys/:key/submit
 */
router.post("/surveys/:key/submit", async (req, res, next) => {
  try {
    const { key } = req.params;

    const byId = mongoose.isValidObjectId(key)
      ? await Survey.findById(key).lean()
      : null;
    const survey = byId ?? (await Survey.findOne({ publicToken: key }).lean());
    if (!survey) return res.status(404).json({ error: "Survey not found" });

    const { answers } = req.body as {
      answers: Record<string, string | string[]>;
    };
    if (!answers || typeof answers !== "object")
      return res.status(400).json({ error: "Invalid payload" });

    const cleanOne = (s: string) =>
      String(s)
        .trim()
        .replace(/^\s*\[/, "")
        .replace(/\]\s*$/, "")
        .replace(/^['"]+|['"]+$/g, "")
        .trim();

    const rawChoices = Object.entries(answers).map(([qid, val]) => ({
      questionId: String(qid),
      optionIds: Array.isArray(val)
        ? val.map((v) => String(v))
        : typeof val === "string" && val
          ? [String(val)]
          : [],
    }));

    const questionIds = rawChoices.map((c) => c.questionId);
    const optionDocs = await Option.find({
      questionId: { $in: questionIds },
    }).lean();

    const optionsByQ = new Map<string, Array<any>>();
    for (const o of optionDocs) {
      const k = String((o as any).questionId);
      if (!optionsByQ.has(k)) optionsByQ.set(k, []);
      optionsByQ.get(k)!.push(o);
    }

    const finalChoices = rawChoices.map((c) => {
      const arr: string[] = [];
      for (const raw of c.optionIds || []) {
        const cleaned = cleanOne(raw);
        if (mongoose.isValidObjectId(cleaned)) {
          arr.push(cleaned);
          continue;
        }
        const match = (optionsByQ.get(c.questionId) || []).find(
          (o) => String((o as any).text ?? "").trim() === cleaned
        );
        if (match) arr.push(String((match as any)._id));
      }
      return { questionId: c.questionId, optionIds: arr };
    });

    const Response = (await import("../models/Response")).default;
    await Response.create({ surveyId: survey._id, choices: finalChoices });
    await Survey.updateOne({ _id: survey._id }, { $inc: { totalCount: 1 } });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/public/report.pdf
 */
router.post("/report.pdf", async (req, res) => {
  try {
    const {
      surveyName = "",
      companyName = "",
      companyLogo = "",
      sections = [],
    } = req.body as {
      surveyName?: string;
      companyName?: string;
      companyLogo?: string;
      sections: {
        title: string;
        rows: {
          question: string;
          answers?: string[];
          risks?: ("green" | "yellow" | "red" | undefined)[];
        }[];
      }[];
    };

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 22, left: 40, right: 40, bottom: 80 },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="report.pdf"`);
    doc.pipe(res);

    const page = () => ({
      w: doc.page.width,
      m: doc.page.margins.left,
      usableBottom: doc.page.height - doc.page.margins.bottom,
    });

    /* ---------- TIGHT HEADER (Survey Name only) ---------- */
    /* ---------- IMPROVED HEADER (Company Logo + Survey Name) ---------- */
    const drawHeader = () => {
      const pageWidth = doc.page.width;
      const margins = doc.page.margins;

      const logoUrls = Array.isArray(companyLogo)
        ? companyLogo
        : companyLogo
          ? [companyLogo]
          : [];

      const logoWidth = 80;
      const logoHeight = 40;
      const logoSpacing = 30;

      const spacing = 15; // tighter clean spacing

      // ✅ Start EXACTLY at top margin
      let currentY = margins.top;

      // ===== LOGO =====
      if (logoUrls.length > 0) {
        const totalWidth =
          logoUrls.length * logoWidth +
          (logoUrls.length - 1) * logoSpacing;

        let x = (pageWidth - totalWidth) / 2;

        logoUrls.forEach((logo) => {
          try {
            doc.image(logo, x, currentY, {
              fit: [logoWidth, logoHeight],
            });
          } catch (err) {
            console.warn("Logo load failed:", logo);
          }

          x += logoWidth + logoSpacing;
        });

        currentY += logoHeight + spacing;
      }

      // ===== SURVEY NAME =====
      if (surveyName) {
        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#111")
          .text(surveyName, margins.left, currentY, {
            width: pageWidth - margins.left - margins.right,
            align: "left",
          });

        const textHeight = doc.heightOfString(surveyName, {
          width: pageWidth - margins.left - margins.right,
        });

        currentY += textHeight + spacing;
      }

      // ✅ Move cursor correctly after header
      doc.y = currentY;
    };
    // const drawHeader = () => {
    //   const p = page();
    //   const topY = 18;

    //   // Handle logo array properly
    //   const logoUrls = Array.isArray(companyLogo)
    //     ? companyLogo
    //     : companyLogo
    //       ? [companyLogo]
    //       : [];

    //   const logoWidth = 80;
    //   const logoHeight = 40;
    //   const logoSpacing = 80;

    //   let currentY = topY;

    //   // ===== DRAW LOGOS CENTERED =====
    //   if (logoUrls.length > 0) {
    //     const totalWidth =
    //       logoUrls.length * logoWidth +
    //       (logoUrls.length - 1) * logoSpacing;

    //     let x = (p.w - totalWidth) / 2;

    //     logoUrls.forEach((logo) => {
    //       try {
    //         doc.image(logo, x, currentY, {
    //           fit: [logoWidth, logoHeight],
    //         });
    //       } catch (err) {
    //         console.warn("Logo load failed:", logo);
    //       }

    //       x += logoWidth + logoSpacing;
    //     });

    //     currentY += logoHeight + 15; // move below logos
    //   }


    //   // ===== SURVEY NAME (centered & bigger) =====
    //   if (surveyName) {
    //     doc
    //       .font("Helvetica-Bold")
    //       .fontSize(14)
    //       .fillColor("#111")
    //       .text(surveyName, p.m, currentY, {
    //         width: p.w - p.m * 2,
    //         align: "left",
    //       });


    //   }

    //   doc.y = currentY;
    // };

    drawHeader();
    doc.on("pageAdded", drawHeader);

    /* ---------- TABLE SETTINGS ---------- */
    const BORDER = "#2f4250";
    const HEADER_FILL = "#e8e8e8";
    const LINE_WIDTH = 1.2;

    const COL_Q = 295;
    const COL_A = 175;
    const COL_R = 80;
    const TOTAL_W = COL_Q + COL_A + COL_R;
    const rowPad = 8;

    const ensureSpace = (needed: number) => {
      const p = page();
      if (doc.y + needed + 90 > p.usableBottom) doc.addPage();
    };

    const riskColor = (r?: string) => {
      switch ((r || "").toLowerCase()) {
        case "red": return "#d93025";
        case "yellow":
        case "amber": return "#f7b500";
        case "green": return "#2fb45a";
        default: return "#9aa0a6";
      }
    };

    const drawTableHeader = () => {
      const x = page().m;
      const y = doc.y;

      doc.save();
      doc.lineWidth(LINE_WIDTH).strokeColor(BORDER).fillColor(HEADER_FILL);
      doc.rect(x, y, TOTAL_W, 26).fillAndStroke();
      doc.moveTo(x + COL_Q, y).lineTo(x + COL_Q, y + 26).stroke();
      doc.moveTo(x + COL_Q + COL_A, y).lineTo(x + COL_Q + COL_A, y + 26).stroke();

      doc.fillColor("#111").font("Helvetica-Bold").fontSize(11);
      doc.text("Question", x + 8, y + 7, { width: COL_Q - 16 });
      doc.text("Answer", x + COL_Q + 8, y + 7, { width: COL_A - 16 });
      doc.text("Risk", x + COL_Q + COL_A + 8, y + 7, { width: COL_R - 16 });

      doc.restore();
      doc.y = y + 26;
    };

    const drawRow = (row: any) => {
      const x = page().m;

      const answersArr = Array.isArray(row.answers)
        ? row.answers.filter(Boolean)
        : ["—"];

      const risksArr = Array.isArray(row.risks)
        ? row.risks
        : ["red"];

      const hQ = doc.heightOfString(row.question || "—", { width: COL_Q - rowPad * 2 });
      const ansHeights = answersArr.map((a) =>
        Math.max(doc.heightOfString(a || "—", { width: COL_A - rowPad * 2 }), 14)
      );
      const answersH = ansHeights.reduce((sum, h) => sum + h, 0) + Math.max(answersArr.length - 1, 0) * 6;
      const rowH = Math.max(hQ, answersH, 20) + rowPad * 2;

      ensureSpace(rowH + 10);

      const yStart = doc.y;

      doc.save().lineWidth(LINE_WIDTH).strokeColor(BORDER);
      doc.rect(x, yStart, COL_Q, rowH).stroke();
      doc.rect(x + COL_Q, yStart, COL_A, rowH).stroke();
      doc.rect(x + COL_Q + COL_A, yStart, COL_R, rowH).stroke();
      doc.restore();

      doc.font("Helvetica").fontSize(10).fillColor("#111");
      doc.text(row.question || "—", x + rowPad, yStart + rowPad, {
        width: COL_Q - rowPad * 2,
      });

      let ay = yStart + rowPad;
      for (let i = 0; i < answersArr.length; i++) {
        const a = answersArr[i];
        const h = ansHeights[i];
        const col = riskColor(risksArr[i]);

        doc.text(a, x + COL_Q + rowPad, ay, { width: COL_A - rowPad * 2 });

        const barW = 26, barH = 10;
        const ry = ay + (h - barH) / 2;
        const rx = x + COL_Q + COL_A + (COL_R - barW) / 2;
        doc.save().rect(rx, ry, barW, barH).fill(col).restore();

        ay += h + 6;
      }

      doc.y = yStart + rowH;
    };

    /* ---------- DRAW SEGMENTS ---------- */
    sections.forEach((sec) => {
      const title = sec.title || "Segment";

      ensureSpace(80);

      doc.font("Helvetica-Bold").fontSize(13).fillColor("#1c2526");
      doc.text(title, page().m, doc.y);
      doc.moveDown(0.5);

      drawTableHeader();

      (sec.rows || []).forEach((r) => drawRow(r));

      doc.moveDown(0.8);
    });

    doc.end();
  } catch (err) {
    console.error("PDF Error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;