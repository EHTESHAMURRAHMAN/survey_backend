
import { Router } from "express";
import Company from "../models/Company";
import Survey from "../models/Survey";
import Question from "../models/Question";
import Option from "../models/Option";
import Response from "../models/Response";

const router = Router();

/**
 * GET /api/stats/summary

 */
router.get("/summary", async (_req, res, next) => {
  try {
    // Core counts
    const [
      companies,
      surveysTotal,
      surveysActive,
      surveysInactive,
      questions,
      options,
      responsesFallback, // fallback if totalCount isn't used
      totalCountAgg,
      pendingCount,
    ] = await Promise.all([
      Company.countDocuments({}),
      Survey.countDocuments({}),
      Survey.countDocuments({ status: "ACTIVE" }),
      Survey.countDocuments({ status: "INACTIVE" }),
      Question.countDocuments({}),
      Option.countDocuments({}),
      Response.countDocuments({}),
      Survey.aggregate([{ $group: { _id: null, total: { $sum: "$totalCount" } } }]),
      Survey.countDocuments({ status: "ACTIVE", totalCount: { $eq: 0 } }),
    ]);

    const resultsCount = (totalCountAgg?.[0]?.total ?? responsesFallback) || 0;

    // --- last 7 days (including today), no external deps ---
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);

    const last7 = await Response.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // --- top 5 surveys by submissions ---
    const topAgg = await Response.aggregate([
      { $group: { _id: "$surveyId", submissions: { $sum: 1 } } },
      { $sort: { submissions: -1 } },
      { $limit: 5 },
    ]);

    const topIds = topAgg.map((t) => t._id);
    const topDocs = await Survey.find({ _id: { $in: topIds } })
      .select({ name: 1 })
      .lean();
    const nameById = new Map(topDocs.map((s) => [String(s._id), s.name]));
    const topSurveys = topAgg.map((t) => ({
      surveyId: String(t._id),
      name: nameById.get(String(t._id)) ?? "(unknown)",
      submissions: t.submissions,
    }));

    
    const companiesCount = companies;
    const questionsCount = questions;
  

    res.json({
      
      companiesCount,
      questionsCount,
      resultsCount,
      pendingCount,

    
      cards: {
        companies,
        surveysTotal,
        surveysActive,
        surveysInactive,
        questions,
        options,
        results: resultsCount,
        pending: pendingCount,
      },
      last7,       // [{ _id: 'YYYY-MM-DD', count }]
      topSurveys,  // [{ surveyId, name, submissions }]
    });
  } catch (e) {
    next(e);
  }
});

export default router;
