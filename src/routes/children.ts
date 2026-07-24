import { Router } from "express";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import { deleteChildPhotoFile, imageUpload, saveChildPhoto } from "../lib/upload";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { createChildSchema, updateChildSchema } from "../schemas/children";

export const childrenRouter = Router();

childrenRouter.get("/mine", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const children = await prisma.child.findMany({
      where: { parentId: req.user!.sub },
      orderBy: { createdAt: "asc" },
    });
    res.json({ children });
  } catch (err) {
    next(err);
  }
});

childrenRouter.post("/", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = createChildSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid child data", 400);
    }

    const child = await prisma.child.create({
      data: { ...parsed.data, parentId: req.user!.sub },
    });

    res.status(201).json({ child });
  } catch (err) {
    next(err);
  }
});

childrenRouter.patch("/:id", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const child = await prisma.child.findUnique({ where: { id: param(req.params.id) } });
    if (!child) {
      throw new AppError("Child not found", 404);
    }
    if (req.user!.role !== "ADMIN" && child.parentId !== req.user!.sub) {
      throw new AppError("You do not have permission to modify this child", 403);
    }

    const parsed = updateChildSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid child data", 400);
    }

    const updated = await prisma.child.update({ where: { id: child.id }, data: parsed.data });
    res.json({ child: updated });
  } catch (err) {
    next(err);
  }
});

async function loadOwnedChild(childId: string, userId: string, role: string) {
  const child = await prisma.child.findUnique({ where: { id: childId } });
  if (!child) {
    throw new AppError("Child not found", 404);
  }
  if (role !== "ADMIN" && child.parentId !== userId) {
    throw new AppError("You do not have permission to modify this child", 403);
  }
  return child;
}

childrenRouter.post("/:id/photo", requireAuth, requireRole("PARENT", "ADMIN"), (req, res, next) => {
  const childId = param(req.params.id);

  loadOwnedChild(childId, req.user!.sub, req.user!.role)
    .then((child) => {
      imageUpload.single("file")(req, res, async (uploadErr) => {
        try {
          if (uploadErr) {
            throw new AppError(uploadErr.message || "Upload failed", 400);
          }
          if (!req.file) {
            throw new AppError("No file uploaded", 400);
          }

          const photoUrl = await saveChildPhoto(req.file);

          // Replacing an existing photo — remove the old file so storage doesn't accumulate
          // orphaned images every time a parent changes their child's photo.
          if (child.photoUrl) {
            await deleteChildPhotoFile(child.photoUrl);
          }

          const updated = await prisma.child.update({
            where: { id: childId },
            data: { photoUrl },
          });

          res.json({ child: updated });
        } catch (err) {
          next(err);
        }
      });
    })
    .catch(next);
});

childrenRouter.delete("/:id/photo", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const child = await loadOwnedChild(param(req.params.id), req.user!.sub, req.user!.role);
    if (child.photoUrl) {
      await deleteChildPhotoFile(child.photoUrl);
    }
    const updated = await prisma.child.update({ where: { id: child.id }, data: { photoUrl: null } });
    res.json({ child: updated });
  } catch (err) {
    next(err);
  }
});
