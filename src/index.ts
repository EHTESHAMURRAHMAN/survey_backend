import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

// Routes
import companies from "./routes/companies";
import surveys from "./routes/surveys";
import questions from "./routes/questions";
import options from "./routes/options";
import pub from "./routes/public";
import results from "./routes/results";
import stats from "./routes/stats";
import uiConfigRoute from "./routes/uiConfig";
import thankYouRoutes from "./routes/thankYouConfig";
import auth from "./routes/auth";

// Middleware
import requireAuth from "./middleware/requireAuth";

dotenv.config();

const app = express();

/* =========================
   ✅ CORS (TOP PRIORITY)
========================= */
const ORIGIN_RAW = process.env.CORS_ORIGIN || "http://localhost:3000";
const ORIGINS = ORIGIN_RAW.split(",").map((s) => s.trim());

app.use(
  cors({
    origin(origin, callback) {
      // Postman / server-to-server
      if (!origin) return callback(null, true);

      if (ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 🔥 PRE-FLIGHT FIX (MOST IMPORTANT)
app.options("*", cors());

/* =========================
   ✅ BODY PARSERS
========================= */
const JSON_LIMIT = process.env.JSON_LIMIT || "25mb";
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

/* =========================
   ✅ STATIC FILES
========================= */
app.use("/api/uploads", express.static("uploads"));

const serverPublic = path.join(process.cwd(), "public");
app.use("/public", express.static(serverPublic));

const repoRootPublic = path.join(process.cwd(), "..", "public");
app.use("/root-public", express.static(repoRootPublic));

/* =========================
   ✅ HEALTH
========================= */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

/* =========================
   ✅ PUBLIC ROUTES
========================= */
app.use("/api/ui-config", uiConfigRoute);
app.use("/api/thankyou-config", thankYouRoutes);

app.use("/api/public", pub);
app.use("/api/auth", auth);

/* =========================
   🔐 PROTECTED ROUTES
========================= */
app.use("/api/companies", requireAuth, companies);
app.use("/api/surveys", requireAuth, surveys);
app.use("/api/questions", requireAuth, questions);
app.use("/api/options", requireAuth, options);
app.use("/api/results", requireAuth, results);
app.use("/api/stats", requireAuth, stats);

/* =========================
   ❌ 404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
  });
});

/* =========================
   💥 ERROR HANDLER
========================= */
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: err.message || "Server error",
  });
});

/* =========================
   ✅ DATABASE + SERVER
========================= */
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/launchalot";
const PORT = Number(process.env.PORT) || 4000;

mongoose.set("strictQuery", true);

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Mongo connected");

    app.listen(PORT, () => {
      console.log(`🚀 API running on http://localhost:${PORT}`);
      console.log(`📦 Body limit: ${JSON_LIMIT}`);
      console.log(`🌍 CORS origins: ${ORIGINS.join(", ")}`);
    });
  })
  .catch((err) => {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  });
