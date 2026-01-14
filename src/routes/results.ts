import { Router } from "express";
import { Types } from "mongoose";
import Response from "../models/Response";
import Survey from "../models/Survey";

const router = Router();

/**
 * GET /api/results?surveyId=...
 
 */
router.get("/", async (req, res, next) => {
  try {
    const { surveyId } = req.query as { surveyId?: string };
    if (!surveyId || !Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: "surveyId required" });
    }

    const sid = new Types.ObjectId(surveyId);
    const survey = await Survey.findById(sid).lean();
    const total = survey?.totalCount ?? 0;

    const agg = await Response.aggregate([
      { $match: { surveyId: sid } },
      { $unwind: "$choices" },
      { $unwind: "$choices.optionIds" },
      {
        $group: {
          _id: {
            questionId: "$choices.questionId",
            optionId: "$choices.optionIds",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    
    const byQuestion: Record<string, { optionId: string; count: number; pct: number }[]> = {};
    for (const row of agg) {
      const qid = String(row._id.questionId);
      const oid = String(row._id.optionId);
      const count = row.count as number;
      const pct = total ? Math.round((count * 10000) / total) / 100 : 0;
      if (!byQuestion[qid]) byQuestion[qid] = [];
      byQuestion[qid].push({ optionId: oid, count, pct });
    }

    res.json({ total, byQuestion });
  } catch (e) {
    next(e);
  }
});

export default router;
