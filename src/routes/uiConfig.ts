import { Router, Request, Response } from "express";
import UIConfig from "../models/uiConfig";

const router = Router();

/**
 * 🔹 GET /api/ui-config/:page
 * Fetch UI config for a page
 */
router.get("/:page", async (req: Request, res: Response) => {
  try {
    const { page } = req.params;

    const data = await UIConfig.findOne({ page }).lean();

    if (!data) {
      return res.json({});
    }

    return res.json(data.config);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch UI config"
    });
  }
});

/**
 * 🔹 POST /api/ui-config
 * Create UI config (first time)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { page, config } = req.body;

    if (!page || !config) {
      return res.status(400).json({
        message: "page and config are required"
      });
    }

    const existing = await UIConfig.findOne({ page });

    if (existing) {
      return res.status(409).json({
        message: "UI config already exists for this page"
      });
    }

    const uiConfig = await UIConfig.create({
      page,
      config
    });

    return res.status(201).json(uiConfig);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create UI config"
    });
  }
});

/**
 * 🔹 PUT /api/ui-config/:page
 * Update UI config
 */
router.put("/:page", async (req: Request, res: Response) => {
  try {
    const { page } = req.params;
    const config = req.body; // directly req.body

    if (!config || Object.keys(config).length === 0) {
      return res.status(400).json({ message: "config is required" });
    }

    const updated = await UIConfig.findOneAndUpdate(
      { page },
      { config },
      { new: true, upsert: true }
    );

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update UI config" });
  }
});


export default router;
