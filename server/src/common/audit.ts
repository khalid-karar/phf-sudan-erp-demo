import { auditLog } from '../db/schema'
import type { DbOrTx } from '../db/client'
import type { AuthUser } from '../auth/auth-user'

/** Writes an audit row inside the caller's transaction, so it commits (or not) with the change. */
export async function audit(tx: DbOrTx, user: AuthUser | null, action: string, entity: string, entityId: string | null, data?: unknown) {
  await tx.insert(auditLog).values({ userId: user?.id ?? null, action, entity, entityId, data: data ?? null, ip: user?.ip ?? null })
}
