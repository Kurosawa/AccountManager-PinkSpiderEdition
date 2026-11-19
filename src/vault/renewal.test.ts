import { describe, expect, it } from 'vitest'
import type { Billing, Entry } from './entry.ts'
import {
  advanceRenewal,
  renewalLabel,
  renewalStatus,
  renewalsToShow,
  todayLocal,
} from './renewal.ts'

const monthly = (nextRenewal?: string): Billing => ({
  amount: 1000,
  currency: 'JPY',
  cycle: 'monthly',
  ...(nextRenewal ? { nextRenewal } : {}),
})

function entry(serviceName: string, billing?: Billing): Entry {
  return {
    schema: 1,
    serviceName,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(billing ? { billing } : {}),
  }
}

describe('renewalStatus', () => {
  const today = '2026-11-19'
  it('今日から 7 日のうち(今日を含む)は soon', () => {
    expect(renewalStatus(monthly('2026-11-19'), today)).toEqual({
      kind: 'soon',
      days: 0,
      date: '2026-11-19',
    })
    expect(renewalStatus(monthly('2026-11-26'), today)).toMatchObject({ kind: 'soon', days: 7 })
  })
  it('8 日より先は知らせない', () => {
    expect(renewalStatus(monthly('2026-11-27'), today)).toBeNull()
  })
  it('過ぎたものは overdue と、過ぎた日数', () => {
    expect(renewalStatus(monthly('2026-11-18'), today)).toMatchObject({
      kind: 'overdue',
      days: 1,
    })
  })
  it('月をまたいでも日数が合う(夏時間の無い数え方)', () => {
    expect(renewalStatus(monthly('2026-12-02'), '2026-11-28')).toMatchObject({ days: 4 })
  })
  it('買い切り・更新日なし・課金なしは知らせない', () => {
    expect(renewalStatus({ ...monthly('2026-11-19'), cycle: 'once' }, today)).toBeNull()
    expect(renewalStatus(monthly(), today)).toBeNull()
    expect(renewalStatus(undefined, today)).toBeNull()
  })
})

describe('renewalsToShow', () => {
  it('更新日の早い順(過ぎたものが先)。同じ日は名前の順', () => {
    const items = [
      { id: 'a', entry: entry('B', monthly('2026-11-21')) },
      { id: 'b', entry: entry('A', monthly('2026-11-21')) },
      { id: 'c', entry: entry('C', monthly('2026-11-10')) },
      { id: 'd', entry: entry('D', monthly('2026-12-30')) },
      { id: 'e', entry: entry('E') },
    ]
    expect(renewalsToShow(items, '2026-11-19').map((r) => r.item.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('renewalLabel', () => {
  it('今日・あと N 日・過ぎています', () => {
    expect(renewalLabel({ kind: 'soon', days: 0, date: '' })).toBe('今日')
    expect(renewalLabel({ kind: 'soon', days: 2, date: '' })).toBe('あと 2 日')
    expect(renewalLabel({ kind: 'overdue', days: 3, date: '' })).toBe('過ぎています')
  })
})

describe('advanceRenewal', () => {
  it('月払いは、今日より後になるまで 1 か月ずつ進める', () => {
    expect(advanceRenewal(monthly('2026-11-10'), '2026-11-19')).toBe('2026-12-10')
    expect(advanceRenewal(monthly('2026-08-10'), '2026-11-19')).toBe('2026-12-10')
  })
  it('今日と同じ日にはしない(今日より後)', () => {
    expect(advanceRenewal(monthly('2026-10-19'), '2026-11-19')).toBe('2026-12-19')
  })
  it('年払いは 1 年ずつ', () => {
    expect(advanceRenewal({ ...monthly('2025-03-01'), cycle: 'yearly' }, '2026-11-19')).toBe(
      '2027-03-01',
    )
  })
  it('無い日はその月の末日。末日に寄せた日からは数えない', () => {
    expect(advanceRenewal(monthly('2026-01-31'), '2026-02-01')).toBe('2026-02-28')
    expect(advanceRenewal(monthly('2026-01-31'), '2026-02-28')).toBe('2026-03-31')
    expect(advanceRenewal({ ...monthly('2024-02-29'), cycle: 'yearly' }, '2024-03-01')).toBe(
      '2025-02-28',
    )
  })
  it('年をまたぐ', () => {
    expect(advanceRenewal(monthly('2026-12-15'), '2026-12-20')).toBe('2027-01-15')
  })
  it('買い切り・更新日なしは null', () => {
    expect(advanceRenewal({ ...monthly('2026-11-10'), cycle: 'once' }, '2026-11-19')).toBeNull()
    expect(advanceRenewal(monthly(), '2026-11-19')).toBeNull()
  })
})

describe('todayLocal', () => {
  it('端末の時刻の日付', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
