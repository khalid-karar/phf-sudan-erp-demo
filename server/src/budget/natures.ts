// Donor (UNFPA-style) "nature of transaction" catalogue: name, monitoring account, budget category.
export const NATURES: readonly { name: string; account: string; category: string }[] = [
  { name: "Bank charges", account: '74500', category: "Operating Expenses" },
  { name: "Employee salaries", account: '71400', category: "Contractual Services-Individuals and IPs" },
  { name: "Facilities construction and refurbishing costs", account: '73200', category: "Operating Expenses" },
  { name: "Facilities maintenance, utilities and cleaning services", account: '73100', category: "Operating Expenses" },
  { name: "Facilities rental costs", account: '73100', category: "Operating Expenses" },
  { name: "Individual consultants honoraria/fees", account: '71400', category: "Contractual Services-Individuals and IPs" },
  { name: "Internet, connectivity and post and courier services costs", account: '72400', category: "Operating Expenses" },
  { name: "IP support costs", account: '75100', category: "Operating Expenses" },
  { name: "Participation of programme counterparts: other costs (other than travel)", account: '75700', category: "Capacity building of implementing partners" },
  { name: "Participation of programme counterparts: travel costs", account: '75700', category: "Capacity building of implementing partners" },
  { name: "Purchase of any other equipment", account: '72200', category: "Equipment, Vehicles and Furniture" },
  { name: "Purchase of fuel, petroleum and other oils", account: '72300', category: "Supplies, Commodities, Materials" },
  { name: "Purchase of furniture", account: '72200', category: "Equipment, Vehicles and Furniture" },
  { name: "Purchase of hygiene/dignity kits", account: '72300', category: "Supplies, Commodities, Materials" },
  { name: "Purchase of ICT, Audio equipment and software", account: '72800', category: "Equipment, Vehicles and Furniture" },
  { name: "Purchase of medical equipment & supplies", account: '72300', category: "Supplies, Commodities, Materials" },
  { name: "Purchase of pharmaceutical products", account: '72300', category: "Supplies, Commodities, Materials" },
  { name: "Purchase of printing and media services and publications", account: '74200', category: "Operating Expenses" },
  { name: "Purchase of transportation equipment", account: '72200', category: "Equipment, Vehicles and Furniture" },
  { name: "Purchases of office & IT supplies", account: '72500', category: "Supplies, Commodities, Materials" },
  { name: "Rental, repair & maintenance of non-transport equipment", account: '73400', category: "Operating Expenses" },
  { name: "Rental, repair & maintenance of transportation means", account: '73400', category: "Operating Expenses" },
  { name: "Services contracted from companies", account: '72100', category: "Contractual Services-companies" },
  { name: "Telephony services", account: '72400', category: "Operating Expenses" },
  { name: "Training and capacity building activities: other costs (other than travel)", account: '75700', category: "Capacity building of implementing partners" },
  { name: "Training and capacity building activities: travel costs", account: '75700', category: "Capacity building of implementing partners" },
  { name: "Transportation and distribution costs", account: '74700', category: "Operating Expenses" },
  { name: "Travel: accommodation, per diem & incidentals (not related to capacity building / counterpart participation)", account: '71600', category: "Travel" },
  { name: "Travel: tickets (not related to training and capacity building / counterpart participation)", account: '71600', category: "Travel" },
  { name: "Cash Voucher Assistance", account: '74500', category: "Operating Expenses" },
]

export const natureByName = (n: string | null | undefined) => {
  const k = (n ?? '').trim().toLowerCase()
  return k ? NATURES.find((x) => x.name.toLowerCase() === k) : undefined
}

/** Best guess of the donor nature of transaction from a free-text budget item. Null when nothing fits; staff can set it afterwards. */
export function guessNature(item: string): string | null {
  const t = item.toLowerCase()
  const has = (...w: string[]) => w.some((x) => t.includes(x))
  if (has('cva', 'voucher', 'cash assistance', 'emergency cva')) return 'Cash Voucher Assistance'
  if (has('support cost', 'ip support')) return 'IP support costs'
  if (has('stationar', 'stationery', 'office suppl')) return 'Purchases of office & IT supplies'
  if (has('internet', 'communication', 'telephon')) return 'Internet, connectivity and post and courier services costs'
  if (has('rent') && has('vehicle', 'car', 'transport')) return 'Rental, repair & maintenance of transportation means'
  if (has('transport', 'vehicle')) return 'Transportation and distribution costs'
  if (has('hall', 'venue', 'rent')) return 'Facilities rental costs'
  if (has('salar', 'social worker', 'case manger', 'case manager', 'midwife', 'guard', 'cleaner', 'assistant', 'reception', 'technical personnel', 'incentive', 'running cost', 'counselor', 'counsellor', 'doctor', 'docter', 'nurse', 'officer', 'staff salar')) return 'Employee salaries'
  if (has('facilitat', 'consult', 'coordinat')) return 'Individual consultants honoraria/fees'
  if (has('dsa', 'participant', 'refreshment', 'banner', 'documentation', 'training', 'material', 'matirial', 'support staff', 'supporting staff')) return 'Training and capacity building activities: other costs (other than travel)'
  if (has('printing', 'media')) return 'Purchase of printing and media services and publications'
  if (has('fuel')) return 'Purchase of fuel, petroleum and other oils'
  return null
}

/** The organisation's own expense account that a donor nature of transaction is booked to by default. */
export function localAccount(nature: string | null): string {
  const t = (nature ?? '').toLowerCase()
  if (t.includes('cash voucher')) return '5101'
  if (t.includes('salar') || t.includes('consultant')) return '5201'
  if (t.includes('training') || t.includes('participation')) return '5103'
  if (t.includes('medical') || t.includes('pharma') || t.includes('hygiene')) return '5102'
  if (t.includes('office') || t.includes('printing')) return '5204'
  if (t.includes('internet') || t.includes('telephon')) return '5203'
  if (t.includes('rent')) return '5207'
  if (t.includes('fuel') || t.includes('transport')) return '5202'
  if (t.includes('bank')) return '5205'
  return '5299'
}
