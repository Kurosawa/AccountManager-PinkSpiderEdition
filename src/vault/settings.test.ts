import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, parseRateInput, parseSettings, validRate, yenTotal } from './settings.ts'

describe('換算レート(discussion53)', () => {
  it('入力欄の文字をレートにする', () => {
    expect(parseRateInput('150')).toBe(150)
    expect(parseRateInput(' 152.35 ')).toBe(152.35)
    expect(parseRateInput('１５０．５')).toBe(150.5)
    expect(parseRateInput('1,000')).toBe(1000)
  })
  it('空・形が違う・範囲の外は null', () => {
    for (const t of ['', '0', '-1', '150.123', 'abc', '1e3', '10000.01', '.5']) {
      expect({ t, rate: parseRateInput(t) }).toEqual({ t, rate: null })
    }
  })
  it('validRate は小数 2 桁まで', () => {
    expect(validRate(0.01)).toBe(true)
    expect(validRate(10_000)).toBe(true)
    expect(validRate(150.001)).toBe(false)
    expect(validRate(Number.NaN)).toBe(false)
    expect(validRate('150')).toBe(false)
  })
  it('円にまとめる(1 円未満は四捨五入)', () => {
    expect(yenTotal({ JPY: 10_525, USD: 24 }, 150)).toBe(14_125)
    expect(yenTotal({ JPY: 0, USD: 1.99 }, 150.25)).toBe(299)
  })
  it('復号した設定のレートを確かめる', () => {
    const ok = { schema: 1, autoLockMinutes: 5, usdJpyRate: { rate: 150, decidedOn: '2026-11-19' } }
    expect(parseSettings(ok)).toEqual(ok)
    expect(parseSettings({ ...ok, usdJpyRate: { rate: -1, decidedOn: '2026-11-19' } })).toEqual(
      DEFAULT_SETTINGS,
    )
    expect(parseSettings({ ...ok, usdJpyRate: { rate: 150, decidedOn: 'きのう' } })).toEqual(
      DEFAULT_SETTINGS,
    )
    expect(parseSettings({ ...ok, usdJpyRate: 150 })).toEqual(DEFAULT_SETTINGS)
  })
})
