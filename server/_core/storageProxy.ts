import type { Express } from "express";
import { parse } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { getUserById, requireDb, userCanAccessSchool } from "../db";
import { inventoryDocuments, inventoryCycles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { storageGetSignedUrl } from "../storage";
import { verifySessionToken } from "./session";

export function registerStorageProxy(app: Express) {
  app.get("/api/storage/*", async (req, res) => {
    try {
      const key = (req.params as Record<string, string>)[0];
      if (!key) {
        res.status(400).json({ error: "Missing storage key" });
        return;
      }

      // A storage key is not an authorization credential. Require a valid
      // application session before generating the short-lived R2 URL.
      const cookies = parse(req.headers.cookie ?? "");
      const token = cookies[COOKIE_NAME];
      if (!token) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const userId = await verifySessionToken(token);
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const user = await getUserById(userId);
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // Resolve the storage object through our database record instead of
      // trusting the path itself to identify an authorized resource.
      const db = await requireDb();
      const document = (
        await db
          .select({ cycleId: inventoryDocuments.cycleId })
          .from(inventoryDocuments)
          .where(eq(inventoryDocuments.storageKey, key.replace(/^\/+/, "")))
          .limit(1)
      )[0];

      if (!document) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const cycle = (
        await db
          .select({ schoolId: inventoryCycles.schoolId })
          .from(inventoryCycles)
          .where(eq(inventoryCycles.id, document.cycleId))
          .limit(1)
      )[0];

      if (!cycle || !(await userCanAccessSchool(user, cycle.schoolId))) {
        res.status(403).json({ error: "You do not have access to this file" });
        return;
      }

      const url = await storageGetSignedUrl(key);
      res.redirect(307, url);
    } catch (error) {
      console.error("[Storage] Failed to authorize/generate signed URL:", error);
      res.status(500).json({ error: "Failed to access file" });
    }
  });
}
