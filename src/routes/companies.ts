import { Router } from "express";
import Company from "../models/Company";

const router = Router();

/* ---------- helpers ---------- */
function toDTO(d: any) {
  return {
    id: String(d._id),
    name: d.name ?? "",
    logoUrl: d.logoUrl ?? undefined,
    logoUrls: Array.isArray(d.logoUrls) ? d.logoUrls : [],
  };
}

/* ---------- List ---------- */
router.get("/", async (_req, res, next) => {
  try {
    const docs = await Company.find().sort({ createdAt: 1 }).lean();
    res.json(docs.map(toDTO));
  } catch (e) {
    next(e);
  }
});

/* ---------- Create ---------- */
router.post("/", async (req, res, next) => {
  try {
    const { name, logoUrl, logoUrls } = req.body as {
      name: string;
      logoUrl?: string;
      logoUrls?: string[];
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const normalizedArray = Array.isArray(logoUrls)
      ? logoUrls
      : logoUrl
      ? [logoUrl]
      : [];

    const doc = await Company.create({
      name: name.trim(),
      logoUrl: logoUrl ?? normalizedArray[0] ?? undefined,
      logoUrls: normalizedArray,
    });

    res.json(toDTO(doc));
  } catch (e) {
    next(e);
  }
});

/* ---------- Get one ---------- */
router.get("/:id", async (req, res, next) => {
  try {
    const doc = await Company.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(toDTO(doc));
  } catch (e) {
    next(e);
  }
});



router.patch("/:id", async (req, res, next) => {
  try {
    const { name, logoUrl, logoUrls } = req.body as {
      name?: string;
      logoUrl?: string;      
      logoUrls?: string[];  
    };

    const update: any = {};

    if (typeof name === "string") update.name = name.trim();

    if (Array.isArray(logoUrls)) {
      update.logoUrls = logoUrls;
     
      if (typeof logoUrl === "undefined") {
        update.logoUrl = logoUrls[0] ?? undefined;
      }
    }

    if (typeof logoUrl !== "undefined") {
      update.logoUrl = logoUrl;
    }

    await Company.updateOne({ _id: req.params.id }, { $set: update });

    const updated = await Company.findById(req.params.id).lean();
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(toDTO(updated));
  } catch (e) {
    next(e);
  }
});

/* ---------- ---------- */

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, logoUrls, logoUrl } = req.body as {
      name: string;
      logoUrls?: string[];
      logoUrl?: string;
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const array = Array.isArray(logoUrls) ? logoUrls : [];
    const primary = typeof logoUrl !== "undefined" ? logoUrl : array[0];

    await Company.updateOne(
      { _id: id },
      {
        $set: {
          name: name.trim(),
          logoUrls: array,
          logoUrl: primary ?? undefined,
        },
      }
    );

    const updated = await Company.findById(id).lean();
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(toDTO(updated));
  } catch (e) {
    next(e);
  }
});

/* ---------- Delete ---------- */
router.delete("/:id", async (req, res, next) => {
  try {
    await Company.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
