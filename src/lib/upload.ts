import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";

// Local disk storage under <project root>/uploads, served statically at /uploads (see app.ts).
// No object-storage provider (S3/Cloudinary/etc.) is configured for this project — this is the
// seam to swap in one later, same pattern as src/lib/email.ts's console-log email transport.
// process.cwd() rather than __dirname specifically because __dirname differs between running
// from src/ (tsx) and dist/ (compiled) — both are always invoked from the project root.
export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const ACTIVITY_MEDIA_DIR = path.join(UPLOAD_ROOT, "activities");
const CHILD_PHOTO_DIR = path.join(UPLOAD_ROOT, "children");
const EXPENSE_RECEIPT_DIR = path.join(UPLOAD_ROOT, "receipts");
fs.mkdirSync(ACTIVITY_MEDIA_DIR, { recursive: true });
fs.mkdirSync(CHILD_PHOTO_DIR, { recursive: true });
fs.mkdirSync(EXPENSE_RECEIPT_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function createImageUploader(dir: string) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
        return;
      }
      cb(null, true);
    },
  });
}

function deleteFile(dir: string, url: string): void {
  const filename = path.basename(url);
  const filePath = path.join(dir, filename);
  fs.rm(filePath, { force: true }, (err) => {
    if (err) console.error("Failed to delete uploaded file", filePath, err);
  });
}

export const activityMediaUpload = createImageUploader(ACTIVITY_MEDIA_DIR);

export function activityMediaPublicUrl(filename: string): string {
  return `/uploads/activities/${filename}`;
}

export function deleteActivityMediaFile(url: string): void {
  deleteFile(ACTIVITY_MEDIA_DIR, url);
}

export const childPhotoUpload = createImageUploader(CHILD_PHOTO_DIR);

export function childPhotoPublicUrl(filename: string): string {
  return `/uploads/children/${filename}`;
}

export function deleteChildPhotoFile(url: string): void {
  deleteFile(CHILD_PHOTO_DIR, url);
}

export const expenseReceiptUpload = createImageUploader(EXPENSE_RECEIPT_DIR);

export function expenseReceiptPublicUrl(filename: string): string {
  return `/uploads/receipts/${filename}`;
}

export function deleteExpenseReceiptFile(url: string): void {
  deleteFile(EXPENSE_RECEIPT_DIR, url);
}
