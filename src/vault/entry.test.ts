// 1 件の中身・入力の確かめ・検索・合計・パスワードの生成・1 件の読み書きの流れのテスト(ステップ 4)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateVaultKey, unwrapVaultKey, wrapVaultKey } from '../crypto/keys.ts'
import { derivePasswordKeys } from '../crypto/keys.ts'
import { randomBytes } from '../crypto/bytes.ts'
import { DEFAULT_KDF_PARAMS } from '../shared/kdf-params.ts'
import { ApiError } from './api.ts'
import { addEntry, deleteEntry, loadEntries, updateEntry } from './entries.ts'
import { toDraft, toValues } from './entry-draft.ts'
import {
  compareEntries,
  localDate,
  matches,
  monthlyTotals,
  parseEntry,
  safeUrl,
  validAmount,
  validDate,
  type Entry,
} from './entry.ts'
import type { OpenVault } from './flows.ts'
import { CHAR_SETS, generatePassword, randomIndex } from './password-generator.ts'
import { DEFAULT_SETTINGS } from './settings.ts'

const base = (patch: Partial<Entry> = {}): Entry => ({
  schema: 1,
  serviceName: 'Netflix',
  tags: [],
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
  ...patch,
})

describe('項目の確かめ', () => {
  it('URL は http: と https: だけをリンクにする', () => {
    expect(safeUrl('https://example.com/login')).toBe('https://example.com/login')
    expect(safeUrl('http://example.com')).toBe('http://example.com/')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('JAVASCRIPT:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,x')).toBeNull()
    expect(safeUrl('example.com')).toBeNull()
  })

  it('金額は、円は整数・ドルは小数 2 桁まで', () => {
    expect(validAmount(1490, 'JPY')).toBe(true)
    expect(validAmount(1490.5, 'JPY')).toBe(false)
    expect(validAmount(9.99, 'USD')).toBe(true)
    expect(validAmount(9.999, 'USD')).toBe(false)
    expect(validAmount(-1, 'JPY')).toBe(false)
    expect(validAmount(Number.NaN, 'USD')).toBe(false)
  })

  it('日付は、ある日だけ', () => {
    expect(validDate('2026-02-28')).toBe(true)
    expect(validDate('2026-02-30')).toBe(false)
    expect(validDate('2026/02/01')).toBe(false)
  })

  it('復号した値の、形が違う項目は落とす。サービス名が無ければ読まない', () => {
    expect(parseEntry({ schema: 1, tags: [] })).toBeNull()
    expect(parseEntry({ schema: 2, serviceName: 'A' })).toBeNull()
    const e = parseEntry({
      schema: 1,
      serviceName: 'A',
      tags: ['x', ' x ', 1, ''],
      billing: { amount: 1.5, currency: 'JPY', cycle: 'monthly' },
      twoFactor: { enabled: true, methods: ['app', 'fax'] },
      password: 123,
    })
    expect(e).toMatchObject({ serviceName: 'A', tags: ['x'], twoFactor: { methods: ['app'] } })
    expect(e?.billing).toBeUndefined()
    expect(e?.password).toBeUndefined()
  })
})

describe('入力欄から 1 件にする', () => {
  const values = (patch: Partial<ReturnType<typeof toValues>>) => ({ ...toValues(), ...patch })

  it('サービス名は必須。URL は http(s) だけ', () => {
    expect(toDraft(values({ serviceName: '  ' }))).toMatch('サービス名')
    expect(toDraft(values({ serviceName: 'A', url: 'javascript:alert(1)' }))).toMatch('URL')
  })

  it('空の項目は入れない。パスワードの前後の空白は残す。タグは「、」と「,」で区切る', () => {
    const d = toDraft(
      values({ serviceName: ' A ', password: ' p w ', tags: '仕事、 サブスク,仕事,, ' }),
    )
    expect(d).toEqual({
      schema: 1,
      serviceName: 'A',
      password: ' p w ',
      tags: ['仕事', 'サブスク'],
    })
  })

  it('課金: 金額の形を確かめる', () => {
    const ok = toDraft(
      values({ serviceName: 'A', hasBilling: true, amount: '1,490', nextRenewal: '2026-12-01' }),
    )
    expect(ok).toMatchObject({
      billing: { amount: 1490, currency: 'JPY', cycle: 'monthly', nextRenewal: '2026-12-01' },
    })
    expect(toDraft(values({ serviceName: 'A', hasBilling: true, amount: '' }))).toMatch('金額')
    expect(
      toDraft(values({ serviceName: 'A', hasBilling: true, amount: '9.999', currency: 'USD' })),
    ).toMatch('小数 2 桁')
  })

  it('二段階認証: 「なし」なら方法は入れない', () => {
    const d = toDraft(
      values({ serviceName: 'A', twoFactorKnown: true, twoFactorEnabled: false, methods: ['sms'] }),
    )
    expect(d).toMatchObject({ twoFactor: { enabled: false, methods: [] } })
  })

  it('編集: 元の値を入力欄に戻し、そのまま保存すると同じ中身になる', () => {
    const e = base({
      url: 'https://example.com/',
      password: 'x',
      billing: { amount: 9.99, currency: 'USD', cycle: 'yearly', nextRenewal: '2027-01-01' },
      twoFactor: { enabled: true, methods: ['app', 'securityKey'] },
      tags: ['仕事', 'サブスク'],
      memo: '1 行目\n2 行目',
    })
    const { createdAt: _c, updatedAt: _u, ...rest } = e
    expect(toDraft(toValues(e))).toEqual(rest)
  })
})

describe('検索・並べ替え・合計', () => {
  const items = [
    base({
      serviceName: 'Netflix',
      tags: ['サブスク'],
      billing: { amount: 1490, currency: 'JPY', cycle: 'monthly' },
    }),
    base({
      serviceName: 'Ｇｏｏｇｌｅ',
      accountName: 'work',
      tags: ['仕事'],
      billing: { amount: 120, currency: 'USD', cycle: 'yearly' },
    }),
    base({
      serviceName: 'Adobe',
      memo: '写真の編集',
      billing: { amount: 30000, currency: 'JPY', cycle: 'once' },
    }),
  ]

  it('全角・半角、大文字・小文字を問わずに探す。パスワードは探さない', () => {
    expect(matches(items[1]!, 'google', null)).toBe(true)
    expect(matches(items[1]!, 'GOOGLE work', null)).toBe(true)
    expect(matches(items[1]!, 'google home', null)).toBe(false)
    expect(matches(items[2]!, '写真', null)).toBe(true)
    expect(matches(base({ password: 'secret' }), 'secret', null)).toBe(false)
  })

  it('タグで絞り込む', () => {
    expect(items.filter((e) => matches(e, '', '仕事')).map((e) => e.serviceName)).toEqual([
      'Ｇｏｏｇｌｅ',
    ])
  })

  it('サービス名の順に並べる(全角の英字も同じ文字として並ぶ)', () => {
    expect([...items].sort(compareEntries).map((e) => e.serviceName)).toEqual([
      'Adobe',
      'Ｇｏｏｇｌｅ',
      'Netflix',
    ])
  })

  it('月あたりの合計: 年払いは 12 で割り、買い切りは入れない。通貨ごとに分ける', () => {
    expect(monthlyTotals(items)).toEqual({ JPY: 1490, USD: 10 })
    expect(
      monthlyTotals([
        base({ billing: { amount: 1000, currency: 'JPY', cycle: 'yearly' } }),
        base({ billing: { amount: 1000, currency: 'JPY', cycle: 'yearly' } }),
        base({ billing: { amount: 9.99, currency: 'USD', cycle: 'monthly' } }),
        base({ billing: { amount: 0.01, currency: 'USD', cycle: 'monthly' } }),
      ]),
    ).toEqual({ JPY: 167, USD: 10 })
  })
})

describe('パスワードの生成', () => {
  it('初期値は 20 文字で、4 種類の文字がそれぞれ入る', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword()
      expect(p).toHaveLength(20)
      for (const set of Object.values(CHAR_SETS))
        expect([...set].some((c) => p.includes(c))).toBe(true)
    }
  })

  it('選んだ種類の文字だけを使う。長さは 8〜64 に収める', () => {
    const p = generatePassword({
      length: 30,
      sets: { upper: false, lower: false, digits: true, symbols: false },
    })
    expect(p).toMatch(/^\d{30}$/)
    expect(
      generatePassword({
        length: 3,
        sets: { upper: true, lower: false, digits: false, symbols: false },
      }),
    ).toHaveLength(8)
    expect(
      generatePassword({
        length: 100,
        sets: { upper: true, lower: false, digits: false, symbols: false },
      }),
    ).toHaveLength(64)
    expect(() =>
      generatePassword({
        length: 20,
        sets: { upper: false, lower: false, digits: false, symbols: false },
      }),
    ).toThrow('1 つ以上')
  })

  it('偏りを出さない: はみ出した乱数は捨てて引き直す', () => {
    // 2^32 を 3 で割った余り(1)の分、上の端の 1 つ(2^32 - 1)は捨てる
    const values = [2 ** 32 - 1, 7]
    const random = vi.fn<() => number>(() => values.shift()!)
    expect(randomIndex(3, random)).toBe(1)
    expect(random).toHaveBeenCalledTimes(2)
    expect(randomIndex(3, () => 2 ** 32 - 2)).toBe((2 ** 32 - 2) % 3)
  })
})

describe('1 件の読み書きの流れ(偽のサーバー)', () => {
  afterEach(() => vi.unstubAllGlobals())

  async function openVault(userId = 'u'.repeat(64)): Promise<OpenVault> {
    const keys = await derivePasswordKeys(
      'aoi-sora-hashiru-neko',
      randomBytes(16),
      DEFAULT_KDF_PARAMS,
    )
    const vaultKey = await unwrapVaultKey(
      await wrapVaultKey(await generateVaultKey(), keys.wrapKey, userId),
      keys.wrapKey,
      userId,
    )
    return {
      userId,
      token: 't',
      vaultKey,
      settings: DEFAULT_SETTINGS,
      settingsVersion: 1,
      salt: randomBytes(16),
      kdfParams: DEFAULT_KDF_PARAMS,
      wrappedKey: new Uint8Array(60),
    }
  }

  function server() {
    const rows = new Map<string, { id: string; version: number; ciphertext: string }>()
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        const body = init.body ? JSON.parse(init.body as string) : {}
        const id = path.split('/')[3]
        if (init.method === 'GET') return reply(200, { entries: [...rows.values()] })
        if (init.method === 'POST') {
          rows.set(body.id, { id: body.id, version: 1, ciphertext: body.ciphertext })
          return reply(201, { version: 1 })
        }
        const row = rows.get(id!)
        if (!row) return reply(404, { error: 'not_found' })
        if (row.version !== body.expectedVersion) return reply(409, { error: 'version_conflict' })
        if (init.method === 'PUT') {
          rows.set(id!, { id: id!, version: row.version + 1, ciphertext: body.ciphertext })
          return reply(200, { version: row.version + 1 })
        }
        rows.delete(id!)
        return reply(200, { ok: true })
      }),
    )
    return rows
  }

  it('足して読み直すと同じ中身。サーバーには暗号しか届かない', async () => {
    const rows = server()
    const vault = await openVault()
    const added = await addEntry(vault, {
      schema: 1,
      serviceName: 'Netflix',
      password: 'p@ss',
      tags: [],
    })
    expect(added.entry.createdAt).toBe(added.entry.updatedAt)
    expect(JSON.stringify([...rows.values()])).not.toContain('Netflix')
    const loaded = await loadEntries(vault)
    expect(loaded).toEqual({ items: [added], unreadable: 0 })
  })

  it('直すと版が進み、作成の時刻は残る。古い版で直すと 409', async () => {
    server()
    const vault = await openVault()
    const added = await addEntry(vault, { schema: 1, serviceName: 'A', tags: [] })
    const updated = await updateEntry(vault, added, { schema: 1, serviceName: 'B', tags: [] })
    expect(updated.version).toBe(2)
    expect(updated.entry.createdAt).toBe(added.entry.createdAt)
    await expect(
      updateEntry(vault, added, { schema: 1, serviceName: 'C', tags: [] }),
    ).rejects.toThrow(new ApiError(409, 'version_conflict'))
    await expect(deleteEntry(vault, added)).rejects.toThrow(ApiError)
    await deleteEntry(vault, updated)
    expect((await loadEntries(vault)).items).toEqual([])
  })

  it('ほかの件の暗号と入れ替えられた件・ほかの人の鍵の件は、読めない件として数える', async () => {
    const rows = server()
    const vault = await openVault()
    const a = await addEntry(vault, { schema: 1, serviceName: 'A', tags: [] })
    const b = await addEntry(vault, { schema: 1, serviceName: 'B', tags: [] })
    // a の行に b の暗号を入れる
    rows.set(a.id, { ...rows.get(a.id)!, ciphertext: rows.get(b.id)!.ciphertext })
    const other = await openVault()
    await addEntry(other, { schema: 1, serviceName: 'C', tags: [] })
    const loaded = await loadEntries(vault)
    expect(loaded.items.map((i) => i.entry.serviceName)).toEqual(['B'])
    expect(loaded.unreadable).toBe(2)
  })
})

describe('localDate', () => {
  it('端末の時刻の日付にする', () => {
    const d = new Date(2026, 10, 16, 23, 59)
    expect(localDate(d.toISOString())).toBe('2026-11-16')
  })

  it('読めない値は null', () => {
    expect(localDate('not a date')).toBeNull()
  })
})
