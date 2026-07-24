/**
 * Locally-generated SVG placeholder images for demo data — no external image service, so a live
 * pitch demo never depends on internet access for photos to render. Written as real files under
 * uploads/activities/, using the exact same URL convention src/lib/upload.ts's real upload flow
 * uses, so they render identically to a genuine provider photo upload.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const ACTIVITY_MEDIA_DIR = path.join(UPLOAD_ROOT, "activities");
fs.mkdirSync(ACTIVITY_MEDIA_DIR, { recursive: true });

interface CategoryStyle {
  light: string;
  emoji: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  Swimming: { light: "#0091b8", emoji: "🏊" },
  Football: { light: "#1d9e75", emoji: "⚽" },
  Dance: { light: "#c2569b", emoji: "💃" },
  Art: { light: "#d97a4d", emoji: "🎨" },
  "Martial Arts": { light: "#b23a3a", emoji: "🥋" },
  Music: { light: "#6a5acd", emoji: "🎵" },
  Gymnastics: { light: "#d4a72c", emoji: "🤸" },
};
const FALLBACK_STYLE: CategoryStyle = { light: "#384851", emoji: "⭐" };

const AVATAR_COLORS = ["#1d9e75", "#0091b8", "#b2852f", "#6a5acd", "#c2569b", "#d97a4d"];

function writeSvg(svg: string): string {
  const filename = `${crypto.randomUUID()}.svg`;
  fs.writeFileSync(path.join(ACTIVITY_MEDIA_DIR, filename), svg, "utf-8");
  return `/uploads/activities/${filename}`;
}

/** A category-themed illustration — diagonal gradient, soft decorative orbs, a large emoji. */
export function generateActivityPhoto(category: string): string {
  const style = CATEGORY_STYLES[category] ?? FALLBACK_STYLE;
  const gradId = `g${Math.random().toString(36).slice(2, 8)}`;
  const svg = `<svg width="640" height="400" viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${style.light}" />
      <stop offset="100%" stop-color="#002733" />
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#${gradId})" />
  <circle cx="90" cy="70" r="130" fill="#ffffff" opacity="0.08" />
  <circle cx="580" cy="360" r="170" fill="#ffffff" opacity="0.06" />
  <circle cx="540" cy="60" r="60" fill="#ffffff" opacity="0.07" />
  <text x="50%" y="53%" font-size="150" text-anchor="middle" dominant-baseline="middle">${style.emoji}</text>
</svg>`;
  return writeSvg(svg);
}

/** A simple initials avatar for a "meet the instructor" staff photo. */
export function generateStaffAvatar(firstName: string, lastName: string, colorIndex: number): string {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const svg = `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="${color}" />
  <text x="50%" y="52%" font-family="Inter, system-ui, sans-serif" font-size="150" font-weight="700"
    fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
</svg>`;
  return writeSvg(svg);
}
