// 1 件の中身(Dev Spec 6 章)。暗号にする前の JSON の形と、その確かめ・検索・合計(PRD 5.1)

export const CURRENCIES = ['JPY', 'USD'] as const
export const CYCLES = ['monthly', 'yearly', 'once'] as const
export const TWO_FACTOR_METHODS = ['sms', 'app', 'securityKey', 'email', 'other'] as const

export type Currency = (typeof CURRENCIES)[number]
export type Cycle = (typeof CYCLES)[number]
export type TwoFactorMethod = (typeof TWO_FACTOR_METHODS)[number]

export interface Billing {
  /** 円は整数、ドルは小数 2 桁まで */
  amount: number
  currency: Currency
  cycle: Cycle
  /** YYYY-MM-DD */
  nextRenewal?: string
}

export interface Entry {
  schema: 1
  serviceName: string
  url?: string
  accountName?: string
  email?: string
  displayName?: string
  summary?: string
  password?: string
  billing?: Billing
  twoFactor?: { enabled: boolean; methods: TwoFactorMethod[] }
  backupCodes?: string
  tags: string[]
  memo?: string
  createdAt: string
  updatedAt: string
}

export const CURRENCY_LABEL: Record<Currency, string> = { JPY: '円', USD: 'ドル' }
export const CYCLE_LABEL: Record<Cycle, string> = { monthly: '月', yearly: '年', once: '買い切り' }
export const TWO_FACTOR_LABEL: Record<TwoFactorMethod, string> = {
  sms: 'SMS',
  app: '認証アプリ',
  securityKey: 'セキュリティキー',
  email: 'メール',
  other: 'そのほか',
}

/** リンクにしてよい URL か(http: と https: だけ。Dev Spec 9.2) */
export function safeUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** 記録した日時(ISO 8601)を、端末の時刻の YYYY-MM-DD にする。読めなければ null */
export function localDate(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 日付(YYYY-MM-DD)を短く書く。今年なら 11/21、ほかの年なら 2027/1/5 */
export function shortDate(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return date.slice(0, 4) === today.slice(0, 4) ? `${m}/${d}` : `${y}/${m}/${d}`
}

/** 金額の形を確かめる。円は整数、ドルは小数 2 桁まで。0 以上 */
export function validAmount(amount: number, currency: Currency): boolean {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) return false
  const minor = currency === 'JPY' ? amount : amount * 100
  return Math.abs(minor - Math.round(minor)) < 1e-9
}

/** YYYY-MM-DD で、ある日付か */
export function validDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const d = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text
}

/** タグを、前後の空白を除き、重なりを消してそろえる */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = []
  for (const t of tags) {
    const tag = t.trim()
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined

/**
 * 復号した値を確かめて Entry にする。形が違う項目は落とす。サービス名が無ければ null。
 * 暗号は認証されているので、ここでは自分の古い版・壊れた値から画面を守るだけ
 */
export function parseEntry(value: unknown): Entry | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const serviceName = str(v['serviceName'])
  if (v['schema'] !== 1 || !serviceName) return null
  const entry: Entry = {
    schema: 1,
    serviceName,
    tags: Array.isArray(v['tags'])
      ? normalizeTags(v['tags'].filter((t): t is string => typeof t === 'string'))
      : [],
    createdAt: str(v['createdAt']) ?? '',
    updatedAt: str(v['updatedAt']) ?? '',
  }
  for (const key of [
    'url',
    'accountName',
    'email',
    'displayName',
    'summary',
    'password',
    'backupCodes',
    'memo',
  ] as const) {
    const s = str(v[key])
    if (s !== undefined) entry[key] = s
  }
  const b = v['billing'] as Partial<Billing> | undefined
  if (
    b &&
    typeof b === 'object' &&
    CURRENCIES.includes(b.currency as Currency) &&
    CYCLES.includes(b.cycle as Cycle) &&
    typeof b.amount === 'number' &&
    validAmount(b.amount, b.currency as Currency)
  ) {
    entry.billing = { amount: b.amount, currency: b.currency!, cycle: b.cycle! }
    if (typeof b.nextRenewal === 'string' && validDate(b.nextRenewal)) {
      entry.billing.nextRenewal = b.nextRenewal
    }
  }
  const tf = v['twoFactor'] as { enabled?: unknown; methods?: unknown } | undefined
  if (tf && typeof tf === 'object' && typeof tf.enabled === 'boolean') {
    entry.twoFactor = {
      enabled: tf.enabled,
      methods: Array.isArray(tf.methods)
        ? TWO_FACTOR_METHODS.filter((m) => (tf.methods as unknown[]).includes(m))
        : [],
    }
  }
  return entry
}

/** 検索の対象にする項目(パスワード・バックアップコードは対象にしない) */
const SEARCHABLE = [
  'serviceName',
  'url',
  'accountName',
  'email',
  'displayName',
  'summary',
  'memo',
] as const

/** 検索語(空白で区切ると、すべてを含むもの)とタグで絞り込む。大文字・小文字、全角・半角を問わない */
export function matches(entry: Entry, query: string, tag: string | null): boolean {
  if (tag && !entry.tags.includes(tag)) return false
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = fold([...SEARCHABLE.map((k) => entry[k] ?? ''), ...entry.tags].join('\n'))
  return words.every((w) => text.includes(w))
}

function fold(s: string): string {
  return s.normalize('NFKC').toLowerCase()
}

/** サービス名の順(日本語の並び)。同じなら、アカウント名の順 */
export function compareEntries(a: Entry, b: Entry): number {
  return (
    a.serviceName.localeCompare(b.serviceName, 'ja') ||
    (a.accountName ?? '').localeCompare(b.accountName ?? '', 'ja')
  )
}

/** すべての件のタグ(並べて重なりを消したもの) */
export function allTags(entries: readonly Entry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, 'ja'))
}

/**
 * 通貨ごとの、月あたりの合計(PRD 5.1)。年払いは 12 で割り、買い切りは入れない。
 * 端数は合計してから丸める(円は整数、ドルはセント)
 */
export function monthlyTotals(entries: readonly Entry[]): Record<Currency, number> {
  const minor: Record<Currency, number> = { JPY: 0, USD: 0 }
  for (const e of entries) {
    const b = e.billing
    if (!b || b.cycle === 'once') continue
    const units = b.currency === 'JPY' ? b.amount : b.amount * 100
    minor[b.currency] += b.cycle === 'yearly' ? units / 12 : units
  }
  return { JPY: Math.round(minor.JPY), USD: Math.round(minor.USD) / 100 }
}

export function formatMoney(amount: number, currency: Currency): string {
  return currency === 'JPY'
    ? `¥${amount.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`
    : `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
