
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

//helperfunctions
type RiskT = "green" | "yellow" | "red" | undefined;

/**
 * Normalize checkbox rows:
 * - answers[] length === risks[] length
 * - missing risks → RED (unselected checkbox)
 */
const normalizeSectionsForCheckbox = (
  sections: {
    title: string;
    rows: {
      question: string;
      answer?: string;
      answers?: string[];
      risk?: RiskT;
      risks?: RiskT[];
    }[];
  }[]
) => {
  return sections.map((sec) => ({
    ...sec,
    rows: sec.rows.map((row) => {
      // ✅ Only checkbox-style rows
      if (Array.isArray(row.answers)) {
        const answers = row.answers;
        const risks: RiskT[] = Array.isArray(row.risks)
          ? [...row.risks]
          : [];

        // 🔴 Fill missing risks with RED
        while (risks.length < answers.length) {
          risks.push("red");
        }

        return {
          ...row,
          answers,
          risks,
        };
      }

      return row;
    }),
  }));
};

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
      companyName = "",
      companyLogo = "",
      sections = [],
    } = req.body as {
      companyName?: string;
      companyLogo?: string;
      sections: {
        title: string;
        rows: {
          question: string;
          answer?: string;
          answers?: string[];
          risk?: RiskT;
          risks?: RiskT[];
        }[];
      }[];
    };

    // ✅ Normalize checkbox answers
    const normalizedSections = normalizeSectionsForCheckbox(sections);



    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 32, left: 32, right: 32, bottom: 64 },
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="report.pdf"`);
    doc.pipe(res);

    const page = () => ({
      w: doc.page.width,
      h: doc.page.height,
      m: doc.page.margins.left,
      mb: doc.page.margins.bottom,
      usableBottom: doc.page.height - doc.page.margins.bottom,
    });

    // Header with company name + logo
    const drawHeader = () => {
      const p = page();
      const startX = p.m;
      const startY = 18; // top margin Y

      // Company Logo - centered
      // Handle multiple logos (either string or array)
      const logoUrls = Array.isArray(companyLogo)
        ? companyLogo
        : companyLogo
          ? [companyLogo]
          : [];

      const logoWidth = 80;
      const logoHeight = 80;
      const logoSpacing = 20;

      if (logoUrls.length > 0) {
        // Total width of all logos + spacing
        const totalWidth =
          logoUrls.length * logoWidth + (logoUrls.length - 1) * logoSpacing;
        // Center horizontally
        let startX = (p.w - totalWidth) / 2;
        const startY = 18;

        logoUrls.forEach((logo) => {
          try {
            doc.image(logo, startX, startY, {
              fit: [logoWidth, logoHeight],
              align: "center",
              valign: "center",
            });
          } catch (err) {
            if (err instanceof Error) {
              console.warn("Failed to load logo:", logo, err.message);
            } else {
              console.warn("Failed to load logo:", logo, err);
            }
          }
          startX += logoWidth + logoSpacing;
        });
      }

      // Move Y position below the logo
      const afterLogoY = startY + logoHeight + 10;

      // Company Name - centered below logo
      if (companyName) {
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#111");
        doc.text(companyName, startX, startY + logoHeight + 10, {
          align: "left",
        });
      }

      // Move doc.y for rest of content
      doc.moveDown(2);
    };

    drawHeader();
    doc.on("pageAdded", () => {
      drawHeader();
    });

    // Table and row settings
    const BORDER = "#2f4250";
    const HEADER_FILL = "#d2d2d2";
    const LINE_WIDTH = 1.0;

    const COL_Q = 290; // question
    const COL_A = 180; // answer
    const COL_R = 80; // risk
    const TOTAL_W = COL_Q + COL_A + COL_R;
    const rowPad = 6;

    const ensureSpace = (needed: number) => {
      const p = page();
      if (doc.y + needed + 56 > p.usableBottom) doc.addPage();
    };

    const riskColor = (r?: string) => {
      switch ((r || "").toLowerCase()) {
        case "red":
          return "#d93025";
        case "yellow":
        case "amber":
          return "#f7b500";
        case "green":
          return "#2fb45a";
        default:
          return "#9aa0a6";
      }
    };

    const drawTableHeader = () => {
      const x = page().m;
      const y = doc.y;

      doc.save();
      doc.lineWidth(LINE_WIDTH).strokeColor(BORDER).fillColor(HEADER_FILL);
      doc.rect(x, y, TOTAL_W, 22).fillAndStroke();

      doc
        .moveTo(x + COL_Q, y)
        .lineTo(x + COL_Q, y + 22)
        .stroke();
      doc
        .moveTo(x + COL_Q + COL_A, y)
        .lineTo(x + COL_Q + COL_A, y + 22)
        .stroke();

      doc.fillColor("#111").font("Helvetica-Bold").fontSize(10.5);
      doc.text("Question", x + 6, y + 5, { width: COL_Q - 12 });
      doc.text("Answer", x + COL_Q + 6, y + 5, { width: COL_A - 12 });
      doc.text("Risk Level", x + COL_Q + COL_A + 6, y + 5, {
        width: COL_R - 12,
      });
      doc.restore();

      doc.y = y + 22;
    };

    // type RiskT = "green" | "yellow" | "red" | undefined;

    const estimateSegmentMinHeight = (
      title: string,
      firstRow?: {
        question: string;
        answer?: string;
        answers?: string[];
      }
    ) => {
      let h = 0;

      // Segment title height
      h += doc.heightOfString(title, {
        width: TOTAL_W,
      }) + 8;

      // Table header height
      h += 22;

      // At least one row height (estimate)
      if (firstRow) {
        const qH = doc.heightOfString(firstRow.question || "-", {
          width: COL_Q - rowPad * 2,
        });

        const a =
          Array.isArray(firstRow.answers) && firstRow.answers.length
            ? firstRow.answers[0]
            : firstRow.answer ?? "-";

        const aH = doc.heightOfString(a, {
          width: COL_A - rowPad * 2,
        });

        const rowH = Math.max(qH, aH, 16) + rowPad * 2;
        h += rowH;
      } else {
        // fallback minimal row height
        h += 28;
      }

      return h + 12; // buffer
    };


    const drawRow = (row: {
      question: string;
      answer?: string;
      answers?: string[];
      risk?: RiskT;
      risks?: RiskT[];
    }) => {
      const x = page().m;

      const answersArr: string[] =
        Array.isArray(row.answers) && row.answers.length
          ? row.answers
          : [row.answer ?? "-"];

      const risksArr: RiskT[] = [];

      if (Array.isArray(row.answers)) {
        for (let i = 0; i < row.answers.length; i++) {
          // if risk exists at index → selected
          if (row.risks && row.risks[i]) {
            risksArr.push(row.risks[i]);
          } else {
            // unselected → RED
            risksArr.push("red");
          }
        }
      } else {
        risksArr.push(row.risk ?? "red");
      }



      const hQ = doc.heightOfString(row.question || "-", {
        width: COL_Q - rowPad * 2,
      });
      const ansHeights = answersArr.map((a) =>
        Math.max(
          doc.heightOfString(a || "-", { width: COL_A - rowPad * 2 }),
          12
        )
      );
      const answersBlockH =
        ansHeights.reduce((s, h) => s + h, 0) +
        Math.max(answersArr.length - 1, 0) * 4;
      const rowH = Math.max(hQ, answersBlockH, 16) + rowPad * 2;

      ensureSpace(rowH + 6);

      const yStart = doc.y;

      // cell borders
      doc.save().lineWidth(LINE_WIDTH).strokeColor(BORDER);
      doc.rect(x, yStart, COL_Q, rowH).stroke();
      doc.rect(x + COL_Q, yStart, COL_A, rowH).stroke();
      doc.rect(x + COL_Q + COL_A, yStart, COL_R, rowH).stroke();
      doc.restore();

      // Question text
      doc.font("Helvetica").fontSize(10).fillColor("#111");
      doc.text(row.question || "-", x + rowPad, yStart + rowPad, {
        width: COL_Q - rowPad * 2,
      });

      // Answers + risk bars
      let ay = yStart + rowPad;
      for (let i = 0; i < answersArr.length; i++) {
        const a = answersArr[i] ?? "-";
        const h = ansHeights[i];

        doc.text(a, x + COL_Q + rowPad, ay, { width: COL_A - rowPad * 2 });

        // const chosenRisk = risksArr[i] ?? risksArr[0];
        const chosenRisk: RiskT = risksArr[i] ?? risksArr[0] ?? "red";

        const col = riskColor(chosenRisk);
        const barW = 24,
          barH = 9;
        const ry = ay + (h - barH) / 2;
        const rx = x + COL_Q + COL_A + (COL_R - barW) / 2;
        doc.save().rect(rx, ry, barW, barH).fill(col).restore();

        ay += h + 4;
      }

      doc.y = yStart + rowH;
    };

    // Draw content
    // sections.forEach((sec, idx) => {
    //   const title = sec.title || `Segment ${idx + 1}`;
    //   doc.font("Helvetica-Bold").fontSize(11).fillColor("#111");
    //   doc.text(title, page().m, doc.y, { align: "left" });
    //   doc.moveDown(0.4);

    //   const tableTop = doc.y;

    //   drawTableHeader();

    //   // draw rows
    //   (sec.rows || []).forEach((r) => drawRow(r as any));

    //   // EXACT bottom of last row
    //   const tableBottom = doc.y;

    //   // Draw outer box ONLY around actual table
    //   const x = page().m;
    //   const tableHeight = tableBottom - tableTop;

    //   doc.save();
    //   doc.lineWidth(1.5).strokeColor(BORDER);
    //   doc.rect(x, tableTop, TOTAL_W, tableHeight).stroke();
    //   doc.restore();

    //   // spacing AFTER box
    //   doc.moveDown(0.5);
    // });

    sections.forEach((sec, idx) => {
      const title = sec.title || `Segment ${idx + 1}`;

      // 🔒 Ensure title + table start stay together
      const minHeight = estimateSegmentMinHeight(
        title,
        sec.rows?.[0]
      );

      ensureSpace(minHeight);

      // ---- Segment title ----
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111");
      doc.text(title, page().m, doc.y, { align: "left" });
      doc.moveDown(0.4);

      const tableTop = doc.y;

      // ---- Table header ----
      drawTableHeader();

      // ---- Rows ----
      (sec.rows || []).forEach((r) => drawRow(r as any));

      // ---- Outer table box ----
      const tableBottom = doc.y;
      const x = page().m;
      const tableHeight = tableBottom - tableTop;

      doc.save();
      doc.lineWidth(1.5).strokeColor(BORDER);
      doc.rect(x, tableTop, TOTAL_W, tableHeight).stroke();
      doc.restore();

      doc.moveDown(0.5);
    });


    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build PDF" });
  }
});

export default router;
