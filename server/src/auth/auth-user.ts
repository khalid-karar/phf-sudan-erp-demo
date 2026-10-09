export type Access = 'none' | 'view' | 'edit' | 'manage'
export type ModuleKey = 'dashboard' | 'projects' | 'activities' | 'finance' | 'supply' | 'logistics' | 'patients' | 'hr' | 'reports' | 'alerts' | 'settings'
export const MODULES: ModuleKey[] = ['dashboard', 'projects', 'activities', 'finance', 'supply', 'logistics', 'patients', 'hr', 'reports', 'alerts', 'settings']
export const RANK: Record<Access, number> = { none: 0, view: 1, edit: 2, manage: 3 }

/** The signed-in user as seen by every request (loaded fresh from the database each time). */
export interface AuthUser {
  id: string
  email: string
  nameAr: string
  nameEn: string
  roleId: string
  officeId: string
  scope: 'office' | 'all'
  canApprove: boolean
  permissions: Record<string, Access>
  mustChangePassword: boolean
  donorId: string | null // set for a donor representative: only the donor portal is open to them
  ip?: string
}

export function can(u: AuthUser, module: ModuleKey, min: Access = 'view') {
  return RANK[u.permissions[module] ?? 'none'] >= RANK[min]
}

/** The office a user is limited to, or null when they see every office. */
export const scopeOffice = (u: AuthUser) => (u.scope === 'office' ? u.officeId : null)
