import { prisma } from "../lib/prisma";

const SINGLETON_ID = "singleton";

// Lazily creates the row on first read so a fresh environment that skipped `prisma db seed`
// still works — every default here matches the seed's own defaults (see prisma/seed.ts).
export async function getPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

export async function updatePlatformSettings(data: {
  creditValueGbp?: number;
  commissionRatePercent?: number;
  platformLegalName?: string;
  platformAddress?: string;
  platformVatRegistered?: boolean;
  platformVatNumber?: string | null;
  platformVatRatePercent?: number;
}) {
  await getPlatformSettings();
  return prisma.platformSettings.update({ where: { id: SINGLETON_ID }, data });
}
