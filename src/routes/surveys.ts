
import { Router } from "express";
import Survey from "../models/Survey";

const r = Router();

/* ---------------- helpers ---------------- */

function makeToken(length = 12) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < length; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function publicBase(req: any) {

  const raw =
    process.env.PUBLIC_SURVEY_BASE ??
    `${req.protocol}://${req.get("host")}`;
  return String(raw).replace(/\/+$/, "");
}

function shapeSurvey(s: any, base: string) {
  const obj = s.toObject ? s.toObject() : s;
  return {
    id: String(obj._id),
    name: obj.name || "",
    companyId: obj.companyId ? String(obj.companyId) : undefined,
    status: obj.status || "ACTIVE",
    publicToken: obj.publicToken || undefined,
    url: obj.publicToken ? `${base}/s/${obj.publicToken}` : null,
    totalCount: obj.totalCount || 0,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

/* ---------------- routes ---------------- */

// List surveys 
r.get("/", async (req, res, next) => {
  try {
    const { companyId } = req.query as any;
    const filter: any = {};
    if (companyId) filter.companyId = companyId;

    const list = await Survey.find(filter).sort({ createdAt: 1 }).lean();
    const base = publicBase(req);

    res.json(list.map((s: any) => shapeSurvey(s, base)));
  } catch (e) {
    next(e);
  }
});

// Get one survey
r.get("/:id", async (req, res, next) => {
  try {
    const s = await Survey.findById(req.params.id);
    if (!s) return res.status(404).json({ message: "Not found" });

    const base = publicBase(req);
    res.json(shapeSurvey(s, base));
  } catch (e) {
    next(e);
  }
});

// Create survey
r.post("/", async (req, res, next) => {
  try {
    const s = await Survey.create({
      companyId: req.body.companyId,
      name: req.body.name,
      status: req.body.status ?? "ACTIVE",
    });
    const base = publicBase(req);
    res.status(201).json(shapeSurvey(s, base));
  } catch (e) {
    next(e);
  }
});

// Update survey
r.put("/:id", async (req, res, next) => {
  try {
    const s = await Survey.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!s) return res.status(404).json({ message: "Not found" });

    const base = publicBase(req);
    res.json(shapeSurvey(s, base));
  } catch (e) {
    next(e);
  }
});

// Delete survey
r.delete("/:id", async (req, res, next) => {
  try {
    const s = await Survey.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Create  public URL token for a survey
r.post("/:id/create-url", async (req, res, next) => {
  try {
    const s = await Survey.findById(req.params.id);
    if (!s) return res.status(404).json({ message: "Not found" });

    if (!s.publicToken) {
      s.publicToken = makeToken(12);
      await s.save();
    }

    const base = publicBase(req);
    res.json({ token: s.publicToken, url: `${base}/s/${s.publicToken}` });
  } catch (e) {
    next(e);
  }
});

export default r;
