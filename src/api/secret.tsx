// A password shown once, right after it is created or reset. The server keeps only a hash, so this is the only chance to copy it.
import { create } from 'zustand'
import { Button, Modal } from '../components/ui'
import { useStore } from '../lib/store'

interface Secret { who: string; email: string; password: string }
export const useSecret = create<{ s: Secret | null; show: (s: Secret) => void; clear: () => void }>((set) => ({ s: null, show: (s) => set({ s }), clear: () => set({ s: null }) }))

export function SecretDialog() {
  const { s, clear } = useSecret()
  const ar = useStore((x) => x.lang) === 'ar'
  if (!s) return null
  return (
    <Modal open onClose={clear} title={ar ? 'كلمة المرور المؤقتة' : 'Temporary password'}>
      <p className="text-[14px]">
        {ar ? `سلّم هذه البيانات إلى ${s.who}. ستظهر مرة واحدة فقط، وسيُطلب منه تغييرها عند أول دخول.` : `Give these details to ${s.who}. They are shown only once, and the person must change the password at first sign-in.`}
      </p>
      <div className="mt-4 rounded-md border border-line bg-paper p-4 num" dir="ltr">
        <div className="text-[13px] text-muted">{s.email}</div>
        <div className="mt-1 select-all font-mono text-[20px] font-semibold">{s.password}</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={() => void navigator.clipboard?.writeText(`${s.email}\n${s.password}`)}>{ar ? 'نسخ' : 'Copy'}</Button>
        <Button onClick={clear}>{ar ? 'تم' : 'Done'}</Button>
      </div>
    </Modal>
  )
}
