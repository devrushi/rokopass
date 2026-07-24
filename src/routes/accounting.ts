import { Router } from "express";
import { getProviderTaxYearSummary } from "../services/accountingSummary";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import {
  createOnboardingLink,
  fetchConnectAccountStatus,
  getOrCreateConnectAccountId,
} from "../lib/stripeConnect";
import { buildExpensesCsv, buildStatementsCsv, generateStatementPdf } from "../lib/statementDocuments";
import { getCurrentTaxYear } from "../lib/taxYear";
import {
  deleteExpenseReceiptFile,
  expenseReceiptPublicUrl,
  expenseReceiptUpload,
} from "../lib/upload";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import {
  businessProfileSchema,
  createExpenseSchema,
  expenseSearchSchema,
  statementSearchSchema,
  updateExpenseSchema,
} from "../schemas/accounting";
import { loadOwnedExpense, listExpenses } from "../services/expenses";
import { listProviderStatements, loadOwnedStatement } from "../services/payouts";
import { getBusinessProfile, upsertBusinessProfile } from "../services/providerBusiness";

export const accountingRouter = Router();

accountingRouter.use(requireAuth, requireRole("PROVIDER", "ADMIN"));

// --- Business profile ---

accountingRouter.get("/business-profile", async (req, res, next) => {
  try {
    const profile = await getBusinessProfile(req.user!.sub);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

accountingRouter.put("/business-profile", async (req, res, next) => {
  try {
    const parsed = businessProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid business profile", 400);
    }

    const profile = await upsertBusinessProfile(req.user!.sub, parsed.data);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

// --- Stripe Connect (real bank payouts) ---

accountingRouter.post("/connect/onboarding-link", async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
    const accountId = await getOrCreateConnectAccountId(user.id, user.email);
    const url = await createOnboardingLink(accountId);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

accountingRouter.get("/connect/status", async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
    if (!user.stripeConnectAccountId) {
      res.json({ connected: false, detailsSubmitted: false, payoutsEnabled: false });
      return;
    }

    const live = await fetchConnectAccountStatus(user.stripeConnectAccountId);
    if (live.detailsSubmitted !== user.connectDetailsSubmitted || live.payoutsEnabled !== user.connectPayoutsEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: { connectDetailsSubmitted: live.detailsSubmitted, connectPayoutsEnabled: live.payoutsEnabled },
      });
    }

    res.json({ connected: true, ...live });
  } catch (err) {
    next(err);
  }
});

// --- Payout statements ---

accountingRouter.get("/statements", async (req, res, next) => {
  try {
    const parsed = statementSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const statements = await listProviderStatements(req.user!.sub, parsed.data);
    res.json({ statements });
  } catch (err) {
    next(err);
  }
});

accountingRouter.get("/statements/export.csv", async (req, res, next) => {
  try {
    const parsed = statementSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const statements = await listProviderStatements(req.user!.sub, parsed.data);
    const csv = buildStatementsCsv(statements);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="payout-statements.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

accountingRouter.get("/statements/:id", async (req, res, next) => {
  try {
    const statement = await loadOwnedStatement(param(req.params.id), req.user!.sub, req.user!.role);
    res.json({ statement });
  } catch (err) {
    next(err);
  }
});

accountingRouter.get("/statements/:id/pdf", async (req, res, next) => {
  try {
    const statement = await loadOwnedStatement(param(req.params.id), req.user!.sub, req.user!.role);
    const pdf = await generateStatementPdf(statement);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${statement.statementNumber}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// --- Expenses ---

accountingRouter.get("/expenses", async (req, res, next) => {
  try {
    const parsed = expenseSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const expenses = await listExpenses(req.user!.sub, parsed.data);
    res.json({ expenses });
  } catch (err) {
    next(err);
  }
});

accountingRouter.get("/expenses/export.csv", async (req, res, next) => {
  try {
    const parsed = expenseSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const expenses = await listExpenses(req.user!.sub, parsed.data);
    const csv = buildExpensesCsv(expenses);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="expenses.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

accountingRouter.post("/expenses", async (req, res, next) => {
  try {
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid expense", 400);
    }

    const expense = await prisma.providerExpense.create({
      data: { ...parsed.data, providerId: req.user!.sub },
    });
    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
});

accountingRouter.patch("/expenses/:id", async (req, res, next) => {
  try {
    const expense = await loadOwnedExpense(param(req.params.id), req.user!.sub, req.user!.role);

    const parsed = updateExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid expense", 400);
    }

    const updated = await prisma.providerExpense.update({ where: { id: expense.id }, data: parsed.data });
    res.json({ expense: updated });
  } catch (err) {
    next(err);
  }
});

accountingRouter.delete("/expenses/:id", async (req, res, next) => {
  try {
    const expense = await loadOwnedExpense(param(req.params.id), req.user!.sub, req.user!.role);
    if (expense.receiptUrl) {
      deleteExpenseReceiptFile(expense.receiptUrl);
    }
    await prisma.providerExpense.delete({ where: { id: expense.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

accountingRouter.post("/expenses/:id/receipt", (req, res, next) => {
  const expenseId = param(req.params.id);

  loadOwnedExpense(expenseId, req.user!.sub, req.user!.role)
    .then((expense) => {
      expenseReceiptUpload.single("file")(req, res, async (uploadErr) => {
        try {
          if (uploadErr) {
            throw new AppError(uploadErr.message || "Upload failed", 400);
          }
          if (!req.file) {
            throw new AppError("No file uploaded", 400);
          }
          if (expense.receiptUrl) {
            deleteExpenseReceiptFile(expense.receiptUrl);
          }

          const updated = await prisma.providerExpense.update({
            where: { id: expenseId },
            data: { receiptUrl: expenseReceiptPublicUrl(req.file.filename) },
          });
          res.json({ expense: updated });
        } catch (err) {
          next(err);
        }
      });
    })
    .catch(next);
});

// --- Tax-year summary (P&L) ---

accountingRouter.get("/summary", async (req, res, next) => {
  try {
    const taxYear = req.query.taxYear ? Number(req.query.taxYear) : getCurrentTaxYear();
    if (!Number.isInteger(taxYear)) {
      throw new AppError("Invalid taxYear", 400);
    }
    const summary = await getProviderTaxYearSummary(req.user!.sub, taxYear);
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});
