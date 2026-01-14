
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export default function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = process.env.JWT_SECRET || "change-this-super-secret";

    // 1) Authorization: Bearer <token>
    let token: string | null = null;
    const auth = req.headers.authorization || "";
    if (auth.toLowerCase().startsWith("bearer ")) {
      token = auth.slice(7).trim();
    }

    // 2) Fallback: cookie admin_token
    if (!token) {
      // @ts-ignore
      const cookieHeader: string = req.headers.cookie || "";
      const m = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = jwt.verify(token, secret) as any;
    
    // @ts-ignore
    req.user = { sub: payload.sub, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
