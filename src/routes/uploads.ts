import { Router } from "express";
import { param } from "../lib/requestParams";
import { getUploadsStore } from "../lib/blobStore";

// The Blobs-backed equivalent of express.static(UPLOAD_ROOT) — only mounted when running inside
// a Netlify Function (see app.ts), where uploads live in Netlify Blobs instead of local disk.
export const uploadsRouter = Router();

uploadsRouter.get("/:category/:filename", async (req, res, next) => {
  try {
    const key = `${param(req.params.category)}/${param(req.params.filename)}`;
    const store = getUploadsStore();
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) {
      res.status(404).end();
      return;
    }

    const contentType = (result.metadata?.contentType as string | undefined) ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    // Same relaxation as the disk-static mount — the frontend runs on a different origin in dev
    // and would otherwise be blocked from rendering these as <img> sources.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(Buffer.from(result.data as ArrayBuffer));
  } catch (err) {
    next(err);
  }
});
