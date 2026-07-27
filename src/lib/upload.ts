import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { getUploadsStore } from "./blobStore";

// Local disk storage under <project root>/uploads, served statically at /uploads (see app.ts) —
// used everywhere EXCEPT when actually running inside a Netlify Function (deployed, or under
// `netlify dev`), where the filesystem is read-only and nothing written to it survives past the
// invocation. Netlify sets NETLIFY=true in both of those contexts; nowhere else (plain
// `tsx watch`, the test suite, demo-data seeding) does, so this switch is evaluated per-call
// rather than cached at import time — nothing about local dev, tests, or seeding changes.
// process.cwd() rather than __dirname specifically because __dirname differs between running
// from src/ (tsx) and dist/ (compiled) — both are always invoked from the project root.
export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const ACTIVITY_MEDIA_DIR = path.join(UPLOAD_ROOT, "activities");
const CHILD_PHOTO_DIR = path.join(UPLOAD_ROOT, "children");
const EXPENSE_RECEIPT_DIR = path.join(UPLOAD_ROOT, "receipts");

const CATEGORY_DIRS: Record<UploadCategory, string> = {
  activities: ACTIVITY_MEDIA_DIR,
  children: CHILD_PHOTO_DIR,
  receipts: EXPENSE_RECEIPT_DIR,
};

export type UploadCategory = "activities" | "children" | "receipts";

// Set explicitly by netlify/functions/api.ts before it imports createApp() — deliberately not
// relying on Netlify's own auto-injected env vars here, since their availability/naming at
// Function *runtime* (as opposed to build time, where NETLIFY=true is well-documented) isn't
// something worth staking file storage correctness on. This flag is fully within our control.
function useBlobStorage(): boolean {
  return process.env.RUNNING_IN_NETLIFY_FUNCTION === "true";
}

// A deployed/dev'd Netlify Function's filesystem is read-only outside /tmp — creating these
// directories there would throw at cold-start. Only needed at all for the local-disk backend.
if (!useBlobStorage()) {
  fs.mkdirSync(ACTIVITY_MEDIA_DIR, { recursive: true });
  fs.mkdirSync(CHILD_PHOTO_DIR, { recursive: true });
  fs.mkdirSync(EXPENSE_RECEIPT_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// A single shared multer instance buffering into memory (never writing to disk itself) — which
// backend actually persists the buffer is decided per-call by persistImage() below, so there's
// no need for per-category multer configs anymore.
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
      return;
    }
    cb(null, true);
  },
});

// Shared by real uploads (multer buffers, below) and demo-data seeding (generated SVGs — see
// prisma/demo-assets.ts), so both go through the same disk-vs-Blobs environment switch instead
// of demo seeding having its own separate (and previously always-local-disk-only) code path.
export async function persistAssetBuffer(
  category: UploadCategory,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const key = `${category}/${filename}`;

  if (useBlobStorage()) {
    const store = getUploadsStore();
    // @netlify/blobs' BlobInput accepts string | ArrayBuffer | Blob — not a Node Buffer/Uint8Array
    // directly, and the buffer can be a view into a larger pooled allocation, so slice out exactly
    // the bytes we want into their own ArrayBuffer. Node Buffers are never backed by a
    // SharedArrayBuffer in practice here (multer's memoryStorage and Buffer.from both allocate
    // plain Buffers).
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await store.set(key, arrayBuffer, { metadata: { contentType } });
  } else {
    await fs.promises.writeFile(path.join(CATEGORY_DIRS[category], filename), buffer);
  }

  return `/uploads/${key}`;
}

async function persistImage(category: UploadCategory, file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${crypto.randomUUID()}${ext}`;
  return persistAssetBuffer(category, filename, file.buffer, file.mimetype);
}

async function deleteImage(url: string): Promise<void> {
  const key = url.replace(/^\/uploads\//, "");

  if (useBlobStorage()) {
    const store = getUploadsStore();
    await store.delete(key).catch((err) => console.error("Failed to delete blob", key, err));
    return;
  }

  const [category, filename] = key.split("/") as [UploadCategory, string];
  const filePath = path.join(CATEGORY_DIRS[category], filename);
  await fs.promises.rm(filePath, { force: true }).catch((err) => {
    console.error("Failed to delete uploaded file", filePath, err);
  });
}

export function saveActivityMedia(file: Express.Multer.File): Promise<string> {
  return persistImage("activities", file);
}

export function saveChildPhoto(file: Express.Multer.File): Promise<string> {
  return persistImage("children", file);
}

export function saveExpenseReceipt(file: Express.Multer.File): Promise<string> {
  return persistImage("receipts", file);
}

export const deleteActivityMediaFile = deleteImage;
export const deleteChildPhotoFile = deleteImage;
export const deleteExpenseReceiptFile = deleteImage;
