import { geoMercator, geoPath } from 'd3-geo'
import { useMemo, useState } from 'react'
import sudan from '../data/sudan.geo.json'
import type { Office } from '../data/types'
import { useLang } from '../lib/i18n'

export type SiteStatus = 'good' | 'warning' | 'critical'
export const statusColor: Record<SiteStatus, string> = {
  good: 'var(--color-leaf)',
  warning: 'var(--color-amber)',
  critical: 'var(--color-crescent)',
}

const W = 560
const H = 470

export function SudanMap({
  offices,
  status,
  selected,
  onSelect,
  onPick,
  pick,
}: {
  offices: Office[]
  status: Record<string, SiteStatus>
  selected: string | null
  onSelect: (id: string) => void
  onPick?: (lon: number, lat: number) => void // click anywhere on the map to place a point
  pick?: [number, number] | null
}) {
  const lang = useLang()
  const [hover, setHover] = useState<string | null>(null)
  const { path, project, invert } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projection = geoMercator().fitExtent(
      [
        [16, 16],
        [W - 16, H - 16],
      ],
      sudan as any,
    )
    return {
      path: geoPath(projection)(sudan as any) ?? '',
      project: (lon: number, lat: number) => projection([lon, lat])!,
      invert: (x: number, y: number) => projection.invert!([x, y])!,
    }
  }, [])

  const labelled = new Set([offices.find((o) => o.isHQ)?.id, selected, hover].filter(Boolean) as string[])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-auto w-full ${onPick ? 'cursor-crosshair' : ''}`}
      role="img"
      aria-label={lang === 'ar' ? 'خريطة مكاتب السودان' : 'Map of Sudan offices'}
      onClick={(e) => {
        if (!onPick) return
        const svg = e.currentTarget
        const pt = svg.createSVGPoint()
        pt.x = e.clientX
        pt.y = e.clientY
        const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
        const [lon, lat] = invert(p.x, p.y)
        onPick(Math.round(lon * 100) / 100, Math.round(lat * 100) / 100)
      }}
    >
      <defs>
        <pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1" fill="var(--color-line)" />
        </pattern>
      </defs>
      <path d={path} fill="url(#dots)" stroke="none" />
      <path d={path} fill="none" stroke="var(--color-nile)" strokeOpacity={0.35} strokeWidth={1.4} strokeLinejoin="round" />
      {/* the Nile, roughly — orientation for anyone who knows the country */}
      <polyline
        points={[
          [31.5, 22],
          [31.1, 21],
          [30.5, 19.4],
          [31.9, 18.5],
          [33.9, 17.7],
          [32.55, 15.6],
        ]
          .map(([lo, la]) => project(lo, la).join(','))
          .join(' ')}
        fill="none"
        stroke="var(--color-nile-2)"
        strokeOpacity={0.35}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={[
          [32.55, 15.6],
          [32.66, 13.16],
          [32.5, 11.5],
        ]
          .map(([lo, la]) => project(lo, la).join(','))
          .join(' ')}
        fill="none"
        stroke="var(--color-nile-2)"
        strokeOpacity={0.3}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <polyline
        points={[
          [32.55, 15.6],
          [33.52, 14.4],
          [33.6, 13.55],
          [34.36, 11.79],
          [34.9, 10.9],
        ]
          .map(([lo, la]) => project(lo, la).join(','))
          .join(' ')}
        fill="none"
        stroke="var(--color-nile-2)"
        strokeOpacity={0.3}
        strokeWidth={1.6}
        strokeLinecap="round"
      />

      {pick && (
        <g transform={`translate(${project(pick[0], pick[1]).join(',')})`}>
          <circle r={14} fill="var(--color-crescent)" opacity={0.18} />
          <circle r={7} fill="var(--color-crescent)" stroke="white" strokeWidth={2.5} />
        </g>
      )}
      {offices.map((o) => {
        const [x, y] = project(o.lon, o.lat)
        const st = status[o.id] ?? 'good'
        const isSel = selected === o.id
        return (
          <g
            key={o.id}
            transform={`translate(${x},${y})`}
            className="cursor-pointer"
            onMouseEnter={() => setHover(o.id)}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(o.id)
            }}
            tabIndex={0}
            role="button"
            aria-label={o.name[lang]}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(o.id)}
          >
            <circle r={18} fill="transparent" />
            {st === 'critical' && <circle r={7} fill={statusColor[st]} className="pin-pulse" />}
            {o.isHQ ? (
              <rect x={-8} y={-8} width={16} height={16} rx={2} fill="var(--color-nile)" stroke="white" strokeWidth={2.5} transform="rotate(45)" />
            ) : (
              <circle r={isSel ? 9 : 7} fill={statusColor[st]} stroke="white" strokeWidth={2.5} />
            )}
            {isSel && <circle r={o.isHQ ? 15 : 13} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />}
            {labelled.has(o.id) && (
              <text
                y={-16}
                textAnchor="middle"
                fontSize={14}
                fontWeight={600}
                fill="var(--color-ink)"
                stroke="var(--color-surface)"
                strokeWidth={4}
                paintOrder="stroke"
                style={{ fontFamily: 'var(--font-plex)' }}
              >
                {o.name[lang].replace('الرئاسة — ', '').replace('HQ — ', '')}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
