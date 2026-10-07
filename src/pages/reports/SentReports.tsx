import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Panel } from '../../components/ui'
import { date } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { periodLabel } from '../../lib/reportData'
import { useStore } from '../../lib/store'

export function SentReports() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  return (
    <div>
      <PageHeader title={ar ? 'سجل إرسال التقارير' : 'Sent reports'} sub={ar ? 'كل تقرير أُرسل بالبريد: لمن، ومتى، ومن أرسله.' : 'Every report sent by email: to whom, when, and by whom.'} />
      <Panel className="overflow-x-auto">
        {s.sentReports.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileText className="mx-auto text-muted" />
            <p className="mt-2 font-medium">{ar ? 'لم يُرسل أي تقرير بعد.' : 'No reports sent yet.'}</p>
            <Link to="/reports/hq" className="mt-1 inline-block text-nile hover:underline">
              {ar ? 'إعداد التقرير الشهري للمقر' : 'Prepare the monthly HQ report'}
            </Link>
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'التقرير' : 'Report'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الفترة' : 'Period'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'إلى' : 'To'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'أُرسل' : 'Sent'}</th>
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الملف' : 'File'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.sentReports.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5">
                    <Link to={r.kind === 'hq' ? '/reports/hq' : '/reports/donor'} className="font-medium hover:text-nile">
                      {r.title[lang]}
                    </Link>
                    <div className="truncate text-[12.5px] text-muted">{r.subject}</div>
                  </td>
                  <td className="py-2.5 pe-3">{periodLabel(r.period, ar)}</td>
                  <td className="py-2.5 pe-3 text-[13px]" dir="ltr">
                    <div className="text-end">{r.to.join(', ')}</div>
                    {r.cc.length > 0 && <div className="text-end text-muted">cc: {r.cc.join(', ')}</div>}
                  </td>
                  <td className="py-2.5 pe-3 whitespace-nowrap">
                    <span className="num">{date(r.at, lang)}</span>
                    <div className="text-[12.5px] text-muted">{s.users.find((u) => u.id === r.by)?.name[lang]}</div>
                  </td>
                  <td className="num px-5 py-2.5 text-[12.5px] text-muted" dir="ltr">
                    {r.fileName}{r.sizeKB > 0 && ` (${r.sizeKB} KB)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
