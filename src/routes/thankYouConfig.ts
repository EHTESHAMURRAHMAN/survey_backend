import { Router, Request, Response } from "express";
import ThankYouConfig from "../models/ThankYouConfig";

const router = Router();

/* 🔹 GET - Fetch configuration by page */
router.get("/:page", async (req: Request, res: Response) => {
  try {
    const { page } = req.params;

    const data = await ThankYouConfig.findOne({ page }).lean();

    // Agar data nahi mila to null return karo (empty object nahi)
    if (!data) {
      return res.status(200).json(null);
    }

    return res.json(data);
  } catch (error) {
    console.error("GET Error:", error);
    return res.status(500).json({ message: "Failed to fetch config" });
  }
});

/* 🔹 PUT - Create ya Update (UPSERT) */
router.put("/:page", async (req: Request, res: Response) => {
  try {
    const { page } = req.params;
    const { image, heading, text } = req.body;

    // Validation
    if (!page) {
      return res.status(400).json({ message: "Page parameter is required" });
    }

    // UPSERT: Agar exist karta hai to UPDATE, nahi to CREATE
    const updated = await ThankYouConfig.findOneAndUpdate(
      { page },
      { 
        image, 
        heading, 
        text,
        updatedAt: new Date()
      },
      { 
        new: true,        // Updated document return karo
        upsert: true,     // Agar nahi mila to create karo
        runValidators: true  // Mongoose validations run karo
      }
    );

    return res.json(updated);
  } catch (error) {
    console.error("PUT Error:", error);
    return res.status(500).json({ message: "Failed to save config" });
  }
});

/* 🔹 DELETE - Optional: Delete configuration */
router.delete("/:page", async (req: Request, res: Response) => {
  try {
    const { page } = req.params;

    const deleted = await ThankYouConfig.findOneAndDelete({ page });

    if (!deleted) {
      return res.status(404).json({ message: "Config not found" });
    }

    return res.json({ message: "Config deleted successfully", data: deleted });
  } catch (error) {
    console.error("DELETE Error:", error);
    return res.status(500).json({ message: "Failed to delete config" });
  }
});

export default router;