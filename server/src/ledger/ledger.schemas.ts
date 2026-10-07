import { z } from 'zod'
import { isoDate, money, period, positiveMoney, signedMoney } from '../common/zod'

const text = z.string().trim().min(1).max(300)

export const accountBody = z.object({
  code: z.string().regex(/^[0-9]{1,6}(-[0-9]{1,4})?$/, 'Digits, optionally with a -NN suffix'),
  parentCode: z.string().min(1),
  nameAr: text,
  nameEn: text,
  postable: z.boolean().default(true),
  currency: z.enum(['USD', 'SDG']).default('USD'),
  officeId: z.string().nullable().optional(),
})
export const accountPatch = z.object({ nameAr: text.optional(), nameEn: text.optional(), active: z.boolean().optional() })

export const ledgerAccountsBody = z.record(
  z.enum(['cash_boxes', 'banks', 'advances', 'fx_gain', 'fx_loss', 'inventory', 'inkind_revenue', 'salaries', 'payroll_deductions']),
  z.string().min(1),
)

export const rateBody = z.object({ date: isoDate, rate: z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'Positive rate, up to 4 decimals'), source: text })

export const manualEntryBody = z.object({
  date: isoDate,
  memo: text,
  ref: z.string().max(100).optional(),
  lines: z
    .array(
      z.object({
        account: z.string().min(1),
        debit: money.default('0'),
        credit: money.default('0'),
        sdg: signedMoney.optional(), // signed SDG amount, required on SDG accounts
        officeId: z.string().min(1),
        projectId: z.string().nullable().optional(),
        budgetLineId: z.string().nullable().optional(),
        activityId: z.string().nullable().optional(),
        memo: z.string().max(300).optional(),
      }),
    )
    .min(2)
    .max(200),
})

export const reverseBody = z.object({ date: isoDate.optional(), reason: text })

export const journalQuery = z.object({
  period: period.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  account: z.string().optional(),
  officeId: z.string().optional(),
  projectId: z.string().optional(),
  source: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export const payBody = z.object({
  method: z.enum(['cash', 'bank', 'bankak', 'advance']),
  accountCode: z.string().optional(), // required for bank/bankak; defaults to the office cash box for cash/advance
  date: isoDate.optional(),
  party: z.string().trim().max(200).optional(), // payee; for advances, the staff member
  holderUserId: z.string().optional(),
  dueDate: isoDate.optional(), // advances: settle by
})

export const receiptBody = z.object({
  date: isoDate.optional(),
  accountCode: z.string().min(1), // cash box or bank receiving the money
  revenueAccountCode: z.string().min(1),
  amount: positiveMoney,
  currency: z.enum(['USD', 'SDG']),
  party: text,
  memo: text,
  officeId: z.string().optional(),
  projectId: z.string().nullable().optional(),
})

export const settleBody = z.object({
  date: isoDate.optional(),
  // Receipt amounts are in the advance's own currency (SDG for an advance paid from a cash box).
  items: z.array(z.object({ description: text, receiptNo: z.string().max(60).optional(), amount: money })).max(200),
})

export const revalueBody = z.object({ date: isoDate.optional() })
export const closeBody = z.object({ note: z.string().max(500).optional() })
export const reportQuery = z.object({ to: isoDate.optional(), from: isoDate.optional(), officeId: z.string().optional(), projectId: z.string().optional() })
