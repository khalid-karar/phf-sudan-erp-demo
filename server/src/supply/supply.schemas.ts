import { z } from 'zod'
import { isoDate, money } from '../common/zod'

const text = z.string().trim().min(1).max(300)
const qty = z.number().int().min(1).max(10_000_000)

export const itemBody = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, 'Letters, digits, dot, dash'),
  nameAr: text,
  nameEn: text,
  unitAr: text,
  unitEn: text,
  category: z.enum(['nutrition', 'medicine', 'medical_supply', 'equipment']),
  unitValue: money,
  minQty: z.number().int().min(0).max(10_000_000).default(0),
  expenseAccountCode: z.string().min(1).optional(), // defaults from the category
})
export const itemPatch = z.object({
  nameAr: text.optional(),
  nameEn: text.optional(),
  unitAr: text.optional(),
  unitEn: text.optional(),
  unitValue: money.optional(),
  minQty: z.number().int().min(0).max(10_000_000).optional(),
  expenseAccountCode: z.string().min(1).optional(),
  active: z.boolean().optional(),
})

export const receiptBody = z.object({
  officeId: z.string().optional(),
  date: isoDate.optional(),
  source: text, // donor or sender
  ref: z.string().trim().max(80).optional(),
  lines: z.array(z.object({ itemId: z.string().min(1), qty, expiry: isoDate.optional() })).min(1).max(200),
})

export const issueBody = z.object({
  officeId: z.string().optional(),
  date: isoDate.optional(),
  activityId: z.string().min(1),
  lines: z.array(z.object({ itemId: z.string().min(1), qty })).min(1).max(200),
})

export const writeOffBody = z.object({
  officeId: z.string().optional(),
  date: isoDate.optional(),
  itemId: z.string().min(1),
  qty,
  reason: text,
})

export const shipmentBody = z.object({
  fromOfficeId: z.string().optional(),
  toOfficeId: z.string().min(1),
  vehicleId: z.string().optional(),
  driver: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ itemId: z.string().min(1), qty })).min(1).max(200),
})
export const dispatchBody = z.object({ vehicleId: z.string().optional(), driver: z.string().trim().max(120).optional() })
export const receiveBody = z.object({
  // Quantities that actually arrived; an item left out is taken as fully received.
  lines: z.array(z.object({ itemId: z.string().min(1), received: z.number().int().min(0) })).max(200).default([]),
  note: z.string().trim().max(500).optional(),
})

export const stockQuery = z.object({ officeId: z.string().optional(), itemId: z.string().optional(), below: z.enum(['min']).optional() })
export const moveQuery = z.object({
  officeId: z.string().optional(),
  itemId: z.string().optional(),
  kind: z.enum(['receipt', 'issue', 'transfer_out', 'transfer_in', 'loss']).optional(),
  activityId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
export const shipmentQuery = z.object({ status: z.enum(['preparing', 'in_transit', 'delivered']).optional(), officeId: z.string().optional() })
export const alertQuery = z.object({ expiryDays: z.coerce.number().int().min(1).max(730).default(90) })

// Logistics
export const vehicleBody = z.object({
  plate: z.string().trim().min(2).max(30),
  modelAr: text,
  modelEn: text,
  kind: z.enum(['pickup', 'suv', 'truck', 'ambulance']),
  officeId: z.string().optional(),
  driver: z.string().trim().max(120).optional(),
  odometer: z.number().int().min(0).max(5_000_000).default(0),
  nextServiceKm: z.number().int().min(0).max(5_000_000).optional(),
})
export const vehiclePatch = z.object({
  modelAr: text.optional(),
  modelEn: text.optional(),
  driver: z.string().trim().max(120).nullable().optional(),
  status: z.enum(['available', 'on_trip', 'maintenance']).optional(),
  nextServiceKm: z.number().int().min(0).max(5_000_000).nullable().optional(),
  active: z.boolean().optional(),
})
export const fuelBody = z.object({
  date: isoDate.optional(),
  liters: z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d{1,7}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Positive litres, up to 2 decimals'),
  costSdg: money,
  odometer: z.number().int().min(0).max(5_000_000),
})
