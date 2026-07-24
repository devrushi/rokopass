import { prisma } from "../lib/prisma";

export async function getBusinessProfile(providerId: string) {
  return prisma.providerBusinessProfile.findUnique({ where: { providerId } });
}

export async function upsertBusinessProfile(
  providerId: string,
  data: {
    legalBusinessName: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    postcode: string;
    country: string;
    utr?: string | null;
    isVatRegistered: boolean;
    vatNumber?: string | null;
    vatRatePercent: number;
  },
) {
  return prisma.providerBusinessProfile.upsert({
    where: { providerId },
    update: data,
    create: { ...data, providerId },
  });
}

/** A single-line address for use on generated invoices/statements. */
export function formatBusinessAddress(profile: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
}): string {
  return [profile.addressLine1, profile.addressLine2, profile.city, profile.postcode, profile.country]
    .filter(Boolean)
    .join(", ");
}
