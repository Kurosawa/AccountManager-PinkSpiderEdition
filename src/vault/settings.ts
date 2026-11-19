// 金庫の設定(暗号にして D1 に置く。Dev Spec 3.3)。画面は src/screens/settings/

export const AUTO_LOCK_CHOICES = [1, 5, 15, 30] as const
export type AutoLockMinutes = (typeof AUTO_LOCK_CHOICES)[number]

export interface Settings {
  schema: 1
  /** さわらないと金庫を閉じるまでの時間(PRD 3.4。初期値 5 分) */
  autoLockMinutes: AutoLockMinutes
  /** 最後にバックアップを書き出した日時(ISO 8601。Dev Spec 14 章)。サーバーには分からない */
  lastBackupAt?: string
  /** 自分で決めたドルの換算レート(1 ドルあたりの円)と、決めた日(端末の時刻の YYYY-MM-DD。discussion53) */
  usdJpyRate?: UsdJpyRate
}

export interface UsdJpyRate {
  rate: number
  decidedOn: string
}

/** レートの範囲(0 より大きく、1 ドル = 10,000 円まで。小数 2 桁まで) */
export const MAX_USD_JPY_RATE = 10_000

export function validRate(rate: unknown): rate is number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > MAX_USD_JPY_RATE) {
    return false
  }
  return Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-9
}

/** 入力欄の文字をレートにする。空・形が違う・範囲の外は null(全角の数字・カンマは受ける) */
export function parseRateInput(text: string): number | null {
  const t = text
    .trim()
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const rate = Number(t)
  return validRate(rate) ? rate : null
}

/** 通貨ごとの月あたりの合計を、レートで円にまとめる(1 円未満は四捨五入) */
export function yenTotal(totals: { JPY: number; USD: number }, rate: number): number {
  return Math.round(totals.JPY + totals.USD * rate)
}

export const DEFAULT_SETTINGS: Settings = { schema: 1, autoLockMinutes: 5 }

/** 復号した設定を確かめる。知らない値は初期値にする(守りの側に倒すため、短いほうの初期値) */
export function parseSettings(value: unknown): Settings {
  const v = (value ?? {}) as Partial<Record<keyof Settings, unknown>>
  const minutes = AUTO_LOCK_CHOICES.find((m) => m === v.autoLockMinutes)
  const settings: Settings = {
    schema: 1,
    autoLockMinutes: minutes ?? DEFAULT_SETTINGS.autoLockMinutes,
  }
  const last = v.lastBackupAt
  if (typeof last === 'string' && last.length <= 40 && !Number.isNaN(Date.parse(last))) {
    settings.lastBackupAt = last
  }
  const r = v.usdJpyRate as Partial<UsdJpyRate> | undefined
  if (
    r &&
    validRate(r.rate) &&
    typeof r.decidedOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.decidedOn) &&
    !Number.isNaN(Date.parse(r.decidedOn))
  ) {
    settings.usdJpyRate = { rate: r.rate, decidedOn: r.decidedOn }
  }
  return settings
}
