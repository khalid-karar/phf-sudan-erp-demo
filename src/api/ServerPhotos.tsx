import { useEffect, useState } from 'react'
import { api } from './http'

/** Live mode: a report's photos live on the server; fetched with the user's sign-in and shown as small thumbnails. */
export function ServerPhotos({ reportId, onOpen }: { reportId: string; onOpen: (url: string) => void }) {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    let dead = false
    const made: string[] = []
    ;(async () => {
      try {
        const list = await api.get<{ id: string; mime: string }[]>(`/attachments?ownerType=field_report&ownerId=${reportId}`)
        for (const a of list.filter((x) => x.mime.startsWith('image/'))) {
          const u = URL.createObjectURL(await api.blob(`/attachments/${a.id}/file`))
          made.push(u)
          if (!dead) setUrls((x) => [...x, u])
        }
      } catch {
        /* no photos to show */
      }
    })()
    return () => {
      dead = true
      made.forEach(URL.revokeObjectURL)
    }
  }, [reportId])
  if (!urls.length) return null
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {urls.map((p, i) => (
        <button key={i} onClick={() => onOpen(p)} className="aspect-square overflow-hidden rounded-md ring-1 ring-line">
          <img src={p} alt="" className="size-full object-cover" />
        </button>
      ))}
    </div>
  )
}
