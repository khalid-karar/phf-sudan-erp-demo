import { toPng } from 'html-to-image'

/**
 * Builds an A4 PDF from on-screen blocks. Each block is captured as an image (so Arabic
 * shaping and fonts come out exactly as the browser draws them) and placed top to bottom,
 * starting a new page whenever the next block doesn't fit.
 */
export async function buildPdf(opts: { blocks: HTMLElement[]; header?: HTMLElement; footerText?: (page: number, total: number) => string; fileName: string }) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = 210
  const H = 297
  const M = 12
  const usableW = W - 2 * M
  const shot = async (el: HTMLElement) => {
    const png = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
    const h = (el.offsetHeight / el.offsetWidth) * usableW
    return { png, h }
  }
  const header = opts.header ? await shot(opts.header) : null
  const top = M + (header ? header.h + 4 : 0)
  const bottom = H - M - 8
  let y = top
  let page = 1
  const pages: number[] = [1]
  if (header) pdf.addImage(header.png, 'PNG', M, M, usableW, header.h)
  for (const el of opts.blocks) {
    const { png, h } = await shot(el)
    if (y + h > bottom && y > top) {
      pdf.addPage()
      page++
      pages.push(page)
      if (header) pdf.addImage(header.png, 'PNG', M, M, usableW, header.h)
      y = top
    }
    // Very tall blocks are scaled down to fit one page rather than cut through a row.
    const hh = Math.min(h, bottom - top)
    const ww = h > bottom - top ? (usableW * hh) / h : usableW
    pdf.addImage(png, 'PNG', M + (usableW - ww) / 2, y, ww, hh)
    y += hh + 4
  }
  const total = page
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.setFontSize(8)
    pdf.setTextColor(120)
    pdf.text(opts.footerText ? opts.footerText(i, total) : `${i} / ${total}`, W / 2, H - 7, { align: 'center' })
  }
  const blob = pdf.output('blob')
  return { blob, sizeKB: Math.round(blob.size / 1024), save: () => pdf.save(opts.fileName) }
}
