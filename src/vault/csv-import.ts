// ほかのアプリ(Chrome・Safari)が書き出した CSV からの取り込み(フェーズ 2 の 3。Dev Spec 16 章・discussion32)。
// CSV は暗号になっていないので、読むのはブラウザの中だけ。サーバーには 1 件ずつ暗号にしてから送る
import { MAX_ENTRIES, MAX_ENTRY_BYTES } from '../shared/api-types.ts'
import { ApiError } from './api.ts'
import { addEntry } from './entries.ts'
import { normalizeTags, safeUrl, type Entry } from './entry.ts'
import type { OpenVault } from './flows.ts'

/** 読み込む CSV の大きさの上限 */
export const MAX_CSV_FILE_BYTES = 10 * 1024 * 1024

/** 1 件の中身(JSON)の上限。暗号にすると IV と認証のタグの分だけ増えるので、少し余裕をみる */
const MAX_DRAFT_BYTES = MAX_ENTRY_BYTES - 256

/** 読める行の数の上限(これを超える CSV は、取り込む前に断る) */
export const MAX_CSV_ROWS = MAX_ENTRIES * 2

export type CsvSource = 'chrome' | 'safari'

export const SOURCE_LABEL: Record<CsvSource, string> = { chrome: 'Chrome', safari: 'Safari' }

/** 取り込んだ件に付けるタグ(discussion32 の 4) */
export const SOURCE_TAG: Record<CsvSource, string> = {
  chrome: 'Chrome から',
  safari: 'Safari から',
}

/** CSV として読めない・Chrome と Safari のどちらの形でもない */
export class CsvFormatError extends Error {}

export type Draft = Omit<Entry, 'createdAt' | 'updatedAt'>

export interface ImportPlan {
  source: CsvSource
  /** 足す件 */
  drafts: Draft[]
  /** 今の管理画面(または同じファイルの前の行)に同じ件があるので、とばす行 */
  duplicates: number
  /** 読めない行(列の数が合わない・サービス名も URL も無い・大きすぎる) */
  unreadable: number
  /** アカウント名もパスワードも無いので、取り込まない行 */
  notLogin: number
  /** 二段階認証の鍵があったが、取り込まなかった件(discussion32 の 3) */
  twoFactorDropped: number
}

/** RFC 4180 の CSV を読む。先頭の BOM を除く。引用符が閉じていなければ CsvFormatError */
export function parseCsv(text: string): string[][] {
  const s = text.startsWith('﻿') ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
      } else {
        field += c
      }
      i++
      continue
    }
    if (c === '"' && field === '') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (c === '\r' && s[i + 1] === '\n') i++
    } else {
      field += c
    }
    i++
  }
  if (quoted) throw new CsvFormatError('引用符が閉じていません')
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // 空の行は除く
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

interface Columns {
  source: CsvSource
  name: number
  url: number
  username: number
  password: number
  note: number | null
  otp: number | null
}

/**
 * 1 行目(列の名前)から、どのアプリの CSV かを見分ける。大文字・小文字は問わない。
 * Chrome: name,url,username,password(,note) / Safari: Title,URL,Username,Password,Notes,OTPAuth
 * (列の名前は、手元の知識と自作の見本による。本物のファイルでの確かめは discussion32 の 6)
 */
export function detectColumns(header: readonly string[]): Columns | null {
  const names = header.map((h) => h.trim().toLowerCase())
  const at = (n: string): number | null => {
    const i = names.indexOf(n)
    return i < 0 ? null : i
  }
  const url = at('url')
  const username = at('username')
  const password = at('password')
  if (url === null || username === null || password === null) return null
  const title = at('title')
  if (title !== null) {
    return {
      source: 'safari',
      name: title,
      url,
      username,
      password,
      note: at('notes'),
      otp: at('otpauth'),
    }
  }
  const name = at('name')
  if (name !== null) {
    return { source: 'chrome', name, url, username, password, note: at('note'), otp: null }
  }
  return null
}

/** URL のホスト名(先頭の www. を除き、小文字)。http: か https: でなければ null */
function hostOf(url: string | undefined): string | null {
  const href = safeUrl(url)
  if (!href) return null
  return new URL(href).hostname.toLowerCase().replace(/^www\./, '')
}

/**
 * 同じ件かを見分ける鍵(discussion32 の 2)。URL のホスト名(無ければサービス名)と、アカウント名(無ければメールアドレス)。
 * パスワードは比べない
 */
export function sameKey(e: Pick<Entry, 'serviceName' | 'url' | 'accountName' | 'email'>): string {
  const place = hostOf(e.url) ?? e.serviceName.normalize('NFKC').trim().toLowerCase()
  const who = (e.accountName ?? e.email ?? '').normalize('NFKC').trim().toLowerCase()
  return `${place}\n${who}`
}

const trimmed = (v: string | undefined): string | undefined => {
  const t = v?.trim()
  return t ? t : undefined
}

/** CSV の 1 行を、足す件にする。サービス名も URL も無ければ null */
function toDraft(row: readonly string[], c: Columns): Draft | null {
  const cell = (i: number | null) => (i === null ? undefined : row[i])
  const rawUrl = trimmed(cell(c.url))
  const url = rawUrl && safeUrl(rawUrl) ? rawUrl : undefined
  const serviceName = trimmed(cell(c.name)) ?? hostOf(url) ?? undefined
  if (!serviceName) return null
  const draft: Draft = { schema: 1, serviceName, tags: normalizeTags([SOURCE_TAG[c.source]]) }
  if (url) draft.url = url
  const username = trimmed(cell(c.username))
  if (username) {
    draft.accountName = username
    if (username.includes('@')) draft.email = username
  }
  // パスワードは前後の空白も中身として残す(Dev Spec 6.1)
  const password = cell(c.password)
  if (password) draft.password = password
  const memo: string[] = []
  // http: か https: でない URL(Android のアプリの印など)は、メモに残す
  if (rawUrl && !url) memo.push(`元の URL: ${rawUrl}`)
  const note = trimmed(cell(c.note))
  if (note) memo.push(note)
  if (memo.length) draft.memo = memo.join('\n')
  // 二段階認証の鍵は取り込まず、印だけ付ける(discussion32 の 3)
  if (trimmed(cell(c.otp))) draft.twoFactor = { enabled: true, methods: ['app'] }
  return draft
}

/** CSV を読み、足す件と、とばす行の数を決める。まだ何も送らない */
export function planImport(text: string, existing: readonly Entry[]): ImportPlan {
  const rows = parseCsv(text)
  const header = rows[0]
  const columns = header ? detectColumns(header) : null
  if (!columns) throw new CsvFormatError('Chrome か Safari の CSV ではありません')
  if (rows.length - 1 > MAX_CSV_ROWS) throw new CsvFormatError('行が多すぎます')
  const plan: ImportPlan = {
    source: columns.source,
    drafts: [],
    duplicates: 0,
    unreadable: 0,
    notLogin: 0,
    twoFactorDropped: 0,
  }
  const seen = new Set(existing.map(sameKey))
  const encoder = new TextEncoder()
  for (const row of rows.slice(1)) {
    if (row.length !== header!.length) {
      plan.unreadable++
      continue
    }
    if (!row[columns.username]?.trim() && !row[columns.password]) {
      plan.notLogin++
      continue
    }
    const draft = toDraft(row, columns)
    if (!draft) {
      plan.unreadable++
      continue
    }
    // 作った日・更新した日(ISO 8601)の分も見込んで、大きさを確かめる
    if (encoder.encode(JSON.stringify(draft)).length + 128 > MAX_DRAFT_BYTES) {
      plan.unreadable++
      continue
    }
    const key = sameKey(draft)
    if (seen.has(key)) {
      plan.duplicates++
      continue
    }
    seen.add(key)
    if (draft.twoFactor) plan.twoFactorDropped++
    plan.drafts.push(draft)
  }
  return plan
}

export interface CsvImportResult {
  added: number
  /** 登録できる件数の上限に達して、途中で止めたか */
  stoppedAtLimit: boolean
}

/** 決めた件を 1 件ずつ暗号にして足す */
export async function runImport(
  vault: OpenVault,
  drafts: readonly Draft[],
  onProgress?: (done: number, total: number) => void,
): Promise<CsvImportResult> {
  const result: CsvImportResult = { added: 0, stoppedAtLimit: false }
  for (const [i, draft] of drafts.entries()) {
    onProgress?.(i, drafts.length)
    try {
      await addEntry(vault, draft)
      result.added++
    } catch (e) {
      if (e instanceof ApiError && e.code === 'limit_reached') {
        result.stoppedAtLimit = true
        break
      }
      throw e
    }
  }
  onProgress?.(drafts.length, drafts.length)
  return result
}
