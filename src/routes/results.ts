import { Router } from "express";
import { Types } from "mongoose";
import Response from "../models/Response";
import Survey from "../models/Survey";

const router = Router();

/**
 * GET /api/results?company=...&survey=...
 */
router.get("/", async (req, res, next) => {
  try {
    const { company, survey } = req.query as {
      company?: string;
      survey?: string;
    };

    // 🔥 Get all responses
    let filter: any = {};

    if (survey && Types.ObjectId.isValid(survey)) {
      filter.surveyId = new Types.ObjectId(survey);
    }

    const responses = await Response.find(filter).lean();

    // 🔥 Get all surveys (for company mapping)
    const surveys = await Survey.find().lean();

    const surveyMap = new Map(
      surveys.map((s) => [String(s._id), s])
    );

    // 🔥 Enrich data (attach companyId)
    const enriched = responses.map((r) => {
      const s = surveyMap.get(String(r.surveyId));

      return {
        surveyId: String(r.surveyId),
        companyId: s?.companyId ? String(s.companyId) : undefined,
      };
    });

    // =========================
    // 🔹 COMPANY WISE
    // =========================
    if (company) {
      const map = new Map<string, number>();

      enriched.forEach((r) => {
        if (r.companyId !== company) return;

        map.set(r.companyId!, (map.get(r.companyId!) || 0) + 1);
      });

      return res.json(
        Array.from(map.entries()).map(([companyId, count]) => ({
          companyId,
          count,
        }))
      );
    }

    // =========================
    // 🔹 SURVEY WISE
    // =========================
    if (survey) {
      const map = new Map<string, number>();

      enriched.forEach((r) => {
        map.set(r.surveyId, (map.get(r.surveyId) || 0) + 1);
      });

      return res.json(
        Array.from(map.entries()).map(([surveyId, count]) => ({
          surveyId,
          count,
        }))
      );
    }

    // 🔥 default (no filter)
    res.json(enriched);
  } catch (e) {
    next(e);
  }
});

export default router;