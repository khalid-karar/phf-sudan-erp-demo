import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { env } from '../config/env'

/** What a file really is, judged by its first bytes. The browser's claimed type is not trusted. */
export function sniff(buf: Buffer): { mime: string; ext: string } | null {
  const starts = (...b: number[]) => b.every((x, i) => buf[i] === x)
  if (starts(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' }
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png' }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  if (buf.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' }
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)/.test(buf.toString('ascii', 8, 12))) return { mime: 'image/heic', ext: 'heic' }
  return null
}

export const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')

const root = () => resolve(env().UPLOAD_DIR)
const pathFor = (hash: string) => join(root(), hash.slice(0, 2), hash)

/** Saves content under its own hash (the same file uploaded twice is stored once). Written then renamed, so a half-written file is never visible. */
export async function storeBlob(buf: Buffer, hash: string) {
  const dest = pathFor(hash)
  try {
    await stat(dest)
    return
  } catch {
    /* not stored yet */
  }
  await mkdir(dirname(dest), { recursive: true })
  const tmp = `${dest}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(tmp, buf, { mode: 0o640 })
  await rename(tmp, dest)
}

export const openBlob = (hash: string) => createReadStream(pathFor(hash))

/** A file name safe to store and show: no folders, no control characters, a sensible length. */
export function cleanName(raw: string, ext: string) {
  // Browsers send UTF-8 names as latin1 inside multipart; undo that so Arabic names survive.
  let n = raw
  try {
    const dec = Buffer.from(raw, 'latin1').toString('utf8')
    if (!dec.includes('�')) n = dec
  } catch {
    /* keep as is */
  }
  n = n.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim().replace(/^\.+/, '')
  if (!n) n = 'file'
  if (n.length > 120) n = n.slice(0, 120)
  return /\.[A-Za-z0-9]{2,5}$/.test(n) ? n : `${n}.${ext}`
}
