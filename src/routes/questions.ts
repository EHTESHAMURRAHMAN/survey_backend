import { Router } from "express";
import Question from "../models/Question";
import Option from "../models/Option";
import { upload } from "../middleware/upload";
const r = Router();

// List 
r.get("/", async (req, res, next) => {
  try {
    const { surveyId } = req.query as any;
    const filter: any = {};
    if (surveyId) filter.surveyId = surveyId;
    const list = await Question.find(filter).sort({ order: 1, createdAt: 1 });
    res.json(list);
  } catch (e) { next(e); }
});

// Get one
r.get("/:id", async (req, res, next) => {
  try {
    const q = await Question.findById(req.params.id);
    if (!q) return res.status(404).json({ message: "Not found" });
    res.json(q);
  } catch (e) { next(e); }
});

// Create
r.post(
  "/",
  upload.single("image"),
  async (req, res, next) => {
    try {
      const data = {
        ...req.body,
        image: req.file
          ? `/uploads/questions/${req.file.filename}` // 🔹 ye change
          : null,
      };

      const created = await Question.create(data);
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  }
);

// Update
r.put(
  "/:id",
  upload.single("image"),
  async (req, res, next) => {
    try {
      const data: any = { ...req.body };

      if (req.file) {
        data.image = `/uploads/questions/${req.file.filename}`;
      }

      const updated = await Question.findByIdAndUpdate(
        req.params.id,
        data,
        { new: true }
      );

      if (!updated)
        return res.status(404).json({ message: "Not found" });

      res.json(updated);
    } catch (e) {
      next(e);
    }
  }
);


// Delete 
r.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await Question.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    await Option.deleteMany({ questionId: deleted._id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
