import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const money = z.number().min(0);
const currency = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((v) => v.toUpperCase());

export const createBudgetLineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).optional(),
  planned: money.optional(),
  forecast: money.optional(),
  spent: money.optional(),
  currency: currency.optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  ownerId: objectId.nullable().optional(),
});

export const updateBudgetLineSchema = createBudgetLineSchema.partial();

export const createBudgetActualSchema = z.object({
  budgetLineId: objectId,
  amount: z.number().min(0),
  currency: currency.optional(),
  description: z.string().max(1000).optional(),
  vendor: z.string().max(200).optional(),
  incurredOn: z.coerce.date(),
  itemId: objectId.nullable().optional(),
  receiptKey: z.string().max(300).optional(),
});

export const updateBudgetActualSchema = createBudgetActualSchema.omit({ budgetLineId: true }).partial();
