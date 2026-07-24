import { z } from "zod";

export const businessProfileSchema = z
  .object({
    legalBusinessName: z.string().min(1, "Legal business name is required"),
    addressLine1: z.string().min(1, "Address line 1 is required"),
    addressLine2: z.string().min(1).nullable().optional(),
    city: z.string().min(1, "City is required"),
    postcode: z.string().min(1, "Postcode is required"),
    country: z.string().min(2).default("GB"),
    utr: z.string().min(1).nullable().optional(),
    isVatRegistered: z.boolean().default(false),
    vatNumber: z.string().min(1).nullable().optional(),
    vatRatePercent: z.coerce.number().int().min(0).max(100).default(20),
  })
  .refine((data) => !data.isVatRegistered || !!data.vatNumber, {
    message: "A VAT number is required for a VAT-registered business",
    path: ["vatNumber"],
  });

export const expenseCategoryEnum = z.enum([
  "COST_OF_GOODS",
  "CAR_VAN_TRAVEL",
  "STAFF_WAGES",
  "RENT_RATES_UTILITIES",
  "REPAIRS_MAINTENANCE",
  "ADVERTISING_MARKETING",
  "LEGAL_PROFESSIONAL",
  "OFFICE_ADMIN",
  "OTHER",
]);

export const createExpenseSchema = z.object({
  category: expenseCategoryEnum,
  description: z.string().min(1, "Description is required"),
  amountGbp: z.coerce.number().int().positive("Amount must be a positive number of pence"),
  incurredOn: z.coerce.date(),
});

export const updateExpenseSchema = createExpenseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export const expenseSearchSchema = z.object({
  taxYear: z.coerce.number().int().min(2000).max(2100).optional(),
  category: expenseCategoryEnum.optional(),
});

export const generatePayoutSchema = z
  .object({
    providerId: z.string().uuid(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((data) => data.periodEnd > data.periodStart, {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"],
  })
  .refine((data) => data.periodEnd <= new Date(), {
    message: "periodEnd cannot be in the future — a payout can only cover completed sessions",
    path: ["periodEnd"],
  });

export const generatePayoutsForAllSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((data) => data.periodEnd > data.periodStart, {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"],
  })
  .refine((data) => data.periodEnd <= new Date(), {
    message: "periodEnd cannot be in the future — a payout can only cover completed sessions",
    path: ["periodEnd"],
  });

export const platformSettingsUpdateSchema = z
  .object({
    creditValueGbp: z.coerce.number().int().positive().optional(),
    commissionRatePercent: z.coerce.number().int().min(0).max(100).optional(),
    platformLegalName: z.string().min(1).optional(),
    platformAddress: z.string().min(1).optional(),
    platformVatRegistered: z.boolean().optional(),
    platformVatNumber: z.string().min(1).nullable().optional(),
    platformVatRatePercent: z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export const statementSearchSchema = z.object({
  taxYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const adminStatementSearchSchema = z.object({
  providerId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "PAID", "FAILED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
