

import { Router } from "express";
import Option from "../models/Option";

const router = Router();

const canonRisk = (v: unknown): "Red" | "Yellow" | "Green" => {
  const s = String(v ?? "").toLowerCase();
  if (s === "red") return "Red";
  if (s === "yellow" || s === "amber") return "Yellow";
  if (s === "green") return "Green";
  return "Green";
};

// GET /api/options?questionId=...
router.get("/", async (req, res, next) => {
  try {
    const { questionId } = req.query as { questionId?: string };
    const filter = questionId ? { questionId } : {};
    const docs = await Option.find(filter).sort({ createdAt: 1 }).lean();

    res.json(
      docs.map((o: any) => ({
        id: String(o._id),
        questionId: String(o.questionId),
        text: String(o.text ?? ""),
        risk: (o.risk as "Red" | "Yellow" | "Green") ?? "Green",
      }))
    );
  } catch (e) {
    next(e);
  }
});

// POST /api/options
router.post("/", async (req, res, next) => {
  try {
    const { questionId, text, risk } = req.body as {
      questionId?: string;
      text?: string;
      risk?: string;
    };
    if (!questionId) return res.status(400).json({ error: "questionId is required" });
    if (!text || !text.trim()) return res.status(400).json({ error: "text is required" });

    const doc = await Option.create({
      questionId,
      text: text.trim(),
      risk: canonRisk(risk),
    });

    res.json({
      id: String(doc._id),
      questionId: String(doc.questionId),
      text: doc.text,
      risk: doc.risk,
    });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/options/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await Option.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;


