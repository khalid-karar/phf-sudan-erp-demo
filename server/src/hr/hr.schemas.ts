import { z } from 'zod'
import { isoDate, money, period } from '../common/zod'

const text = z.string().trim().min(1).max(300)
const allocation = z.object({ lineId: z.string().min(1), pct: z.number().int().min(1).max(100) })
const dept = z.enum(['medical', 'field', 'finance', 'admin', 'supply', 'logistics'])
const contract = z.enum(['permanent', 'fixed', 'daily', 'volunteer'])

export const employeeBody = z.object({
  no: z.string().trim().min(3).max(30).optional(), // generated when omitted
  nameAr: text,
  nameEn: text,
  officeId: z.string().min(1),
  positionAr: text,
  positionEn: text,
  department: dept,
  contract,
  startDate: isoDate,
  endDate: isoDate.optional(),
  salarySdg: money,
  phone: z.string().trim().max(40).optional(),
  userId: z.string().min(1).optional(),
  leaveBalance: z.number().int().min(0).max(365).default(0),
  allocations: z.array(allocation).max(20).default([]),
})
export const employeePatch = z.object({
  nameAr: text.optional(),
  nameEn: text.optional(),
  officeId: z.string().min(1).optional(),
  positionAr: text.optional(),
  positionEn: text.optional(),
  department: dept.optional(),
  contract: contract.optional(),
  endDate: isoDate.nullable().optional(),
  salarySdg: money.optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  userId: z.string().min(1).nullable().optional(),
  leaveBalance: z.number().int().min(0).max(365).optional(),
  status: z.enum(['active', 'ended']).optional(),
  allocations: z.array(allocation).max(20).optional(), // replaces the whole set
})
export const employeeQuery = z.object({ officeId: z.string().optional(), status: z.enum(['active', 'ended']).optional(), department: dept.optional(), q: z.string().trim().max(100).optional() })

export const leaveBody = z.object({
  employeeId: z.string().min(1).optional(), // defaults to the signed-in user's own record
  type: z.enum(['annual', 'sick', 'emergency', 'unpaid']),
  from: isoDate,
  to: isoDate,
  note: z.string().trim().max(500).optional(),
})
export const leaveDecision = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() })
export const leaveQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(), employeeId: z.string().optional(), officeId: z.string().optional() })

export const payrollPreviewQuery = z.object({ period })
export const payrollBody = z.object({
  period,
  accountCode: z.string().min(1), // SDG cash box or bank the net pay leaves from
  date: isoDate.optional(),
})
export const voidBody = z.object({ reason: text, date: isoDate.optional() })
