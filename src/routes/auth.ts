// server/routes/auth.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const router = Router();

const mustGet = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
};

router.post("/login", async (req, res) => {
  const { email, password } = (req.body || {}) as { email?: string; password?: string };

  const ADMIN_EMAIL = mustGet("ADMIN_EMAIL"); // e.g. admin@example.com
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""; // optional
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || ""; // optional bcrypt hash
  const JWT_SECRET = mustGet("JWT_SECRET");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  let ok = false;
  if (ADMIN_PASSWORD_HASH) {
    ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  } else if (ADMIN_PASSWORD) {
    ok = password === ADMIN_PASSWORD;
  }

  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ sub: "admin", email }, JWT_SECRET, { expiresIn: "7d" });

 
  res.cookie?.("admin_token", token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000,
  });

  res.json({ token });
});

export default router;
