// Regenerates src/db/defaults.json (roles, chart of accounts, approval rules) from the demo data,
// so a fresh production install starts with the same structure the client saw in the demo.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as demoSeed from '../../src/data/seed'
import * as demoFin from '../../src/data/finance'

const roles = demoSeed.roles.map((r) => ({ id: r.id, nameAr: r.name.ar, nameEn: r.name.en, descAr: r.description.ar, descEn: r.description.en, permissions: r.permissions, scope: r.scope, canApprove: r.canApprove, system: !!r.system }))
// Office cash boxes are created automatically for each office; keep the rest of the chart.
const accounts = demoFin.accounts
  // Bank accounts are the client's own; they add them on the chart of accounts screen.
  .filter((a) => a.parent !== '1101' && a.parent !== '1102')
  .map((a) => ({ code: a.code, parentCode: a.parent, nameAr: a.name.ar, nameEn: a.name.en, type: a.type, postable: a.postable, currency: a.currency ?? 'USD' }))
const rules = demoSeed.buildSeed().rules.map((r) => ({ nameAr: r.name.ar, nameEn: r.name.en, kind: r.appliesTo, minUsd: r.minUSD.toFixed(2), maxUsd: r.maxUSD === null ? null : r.maxUSD.toFixed(2), chain: r.chain }))
const systemAccounts = { cash_boxes: '1101', banks: '1102', advances: '1103', fx_gain: '4104', fx_loss: '5206', inventory: '1105', inkind_revenue: '4103', salaries: '5201', payroll_deductions: '2104' }
writeFileSync(join(__dirname, '..', 'src', 'db', 'defaults.json'), JSON.stringify({ roles, accounts, rules, systemAccounts }, null, 1) + '\n')
console.log(`roles ${roles.length}, accounts ${accounts.length}, rules ${rules.length}`)
