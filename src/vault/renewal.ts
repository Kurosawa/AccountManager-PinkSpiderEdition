// 課金の更新日のお知らせ(PRD 6 章のフェーズ 3 の 1。discussion51)。
// 更新日は暗号の中にあるので、金庫を開いたときに画面の側だけで数える(サーバーには分からない)
import type { Billing, Entry } from './entry.ts'

/** 今日から何日のうちに来る更新日を知らせるか(今日を含む。discussion51 の 1) */
export const RENEWAL_SOON_DAYS = 7

export type RenewalStatus =
  { kind: 'soon'; days: number; date: string } | { kind: 'overdue'; days: number; date: string }

/** 端末の時刻での今日(YYYY-MM-DD) */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
}

/** 月払い・年払いで次の更新日があるものの、知らせの状態。知らせないものは null(買い切りは更新が無い) */
export function renewalStatus(billing: Billing | undefined, today: string): RenewalStatus | null {
  if (!billing?.nextRenewal || billing.cycle === 'once') return null
  const days = dayNumber(billing.nextRenewal) - dayNumber(today)
  if (days < 0) return { kind: 'overdue', days: -days, date: billing.nextRenewal }
  if (days <= RENEWAL_SOON_DAYS) return { kind: 'soon', days, date: billing.nextRenewal }
  return null
}

/** 知らせるものを、更新日の早い順に(過ぎたものが先に来る) */
export function renewalsToShow<T extends { entry: Entry }>(
  items: readonly T[],
  today: string,
): { item: T; status: RenewalStatus }[] {
  const out: { item: T; status: RenewalStatus }[] = []
  for (const item of items) {
    const status = renewalStatus(item.entry.billing, today)
    if (status) out.push({ item, status })
  }
  return out.sort(
    (a, b) =>
      a.status.date.localeCompare(b.status.date) ||
      a.item.entry.serviceName.localeCompare(b.item.entry.serviceName, 'ja'),
  )
}

/** 印の短い言葉(一覧の行・お知らせ) */
export function renewalLabel(status: RenewalStatus): string {
  if (status.kind === 'overdue') return '過ぎています'
  return status.days === 0 ? '今日' : `あと ${status.days} 日`
}

/** 元の日付から、months か月後の同じ日。無い日(31 日など)はその月の末日にする */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(Math.min(d, last))}`
}

/**
 * 過ぎた更新日を、今日より後になるまで、月払いは 1 か月・年払いは 1 年ずつ進める(discussion51 の 3)。
 * 毎回、元の日付から数える(1/31 → 2/28 → 3/31。末日に寄せた日から数えると、3/28 にずれるため)
 */
export function advanceRenewal(billing: Billing, today: string): string | null {
  if (!billing.nextRenewal || billing.cycle === 'once') return null
  const step = billing.cycle === 'monthly' ? 1 : 12
  for (let k = 1; k <= 1200; k++) {
    const next = addMonths(billing.nextRenewal, step * k)
    if (next > today) return next
  }
  return null
}
