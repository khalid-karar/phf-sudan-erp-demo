import { create } from 'zustand'

/** Set in live mode when the signed-in person is a donor representative: they get the portal and nothing else. */
export const useSession = create<{ donorId: string | null; name: { ar: string; en: string } | null }>(() => ({ donorId: null, name: null }))
