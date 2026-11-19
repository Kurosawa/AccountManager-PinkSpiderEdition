// ほかのアプリの CSV からの取り込みのテスト(Dev Spec 16 章)。見本の CSV は自作(本物のファイルではない)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api.ts'
import {
  CsvFormatError,
  parseCsv,
  planImport,
  runImport,
  sameKey,
  type Draft,
} from './csv-import.ts'
import * as entries from './entries.ts'
import type { Entry } from './entry.ts'
import type { OpenVault } from './flows.ts'

const CHROME = [
  'name,url,username,password,note',
  'example.com,https://example.com/login,taro,pw-1,',
  'Shop,https://www.shop.example/,hanako@example.jp,"p,w ""2"" ",メモ 1',
  'app,android://abc@com.example.app/,jiro,pw-3,',
].join('\r\n')

const SAFARI = [
  '﻿Title,URL,Username,Password,Notes,OTPAuth',
  'Bank,https://bank.example/,taro,pw-b,"2 行の',
  'メモ",otpauth://totp/Bank:taro?secret=JBSWY3DPEHPK3PXP',
  ',https://news.example/,,pw-n,,',
].join('\n')

const entry = (e: Partial<Entry> & { serviceName: string }): Entry => ({
  schema: 1,
  tags: [],
  createdAt: '',
  updatedAt: '',
  ...e,
})

describe('CSV を読む', () => {
  it('引用符・中の改行・"" を読み、BOM と空の行を除く', () => {
    expect(parseCsv('﻿a,"b,c","d ""e"""\r\n\r\n"f\ng",h\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['f\ng', 'h'],
    ])
  })

  it('引用符が閉じていなければ CsvFormatError', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(CsvFormatError)
  })

  it('Chrome でも Safari でもない CSV は CsvFormatError', () => {
    expect(() => planImport('a,b,c\n1,2,3', [])).toThrow(CsvFormatError)
    expect(() => planImport('', [])).toThrow(CsvFormatError)
  })
})

describe('足す件を決める', () => {
  it('Chrome: 項目を割り当て、タグ「Chrome から」を付ける', () => {
    const plan = planImport(CHROME, [])
    expect(plan.source).toBe('chrome')
    expect(plan.drafts).toEqual<Draft[]>([
      {
        schema: 1,
        serviceName: 'example.com',
        url: 'https://example.com/login',
        accountName: 'taro',
        password: 'pw-1',
        tags: ['Chrome から'],
      },
      {
        schema: 1,
        serviceName: 'Shop',
        url: 'https://www.shop.example/',
        accountName: 'hanako@example.jp',
        email: 'hanako@example.jp',
        // パスワードは前後の空白も残す
        password: 'p,w "2" ',
        memo: 'メモ 1',
        tags: ['Chrome から'],
      },
      {
        schema: 1,
        serviceName: 'app',
        accountName: 'jiro',
        password: 'pw-3',
        // http: でも https: でもない URL は、メモに残す
        memo: '元の URL: android://abc@com.example.app/',
        tags: ['Chrome から'],
      },
    ])
  })

  it('Safari: 二段階認証の鍵は取り込まず印だけ付ける。名前が無ければホスト名にする', () => {
    const plan = planImport(SAFARI, [])
    expect(plan.source).toBe('safari')
    expect(plan.twoFactorDropped).toBe(1)
    const [bank, news] = plan.drafts
    expect(bank).toMatchObject({
      serviceName: 'Bank',
      memo: '2 行の\nメモ',
      twoFactor: { enabled: true, methods: ['app'] },
      tags: ['Safari から'],
    })
    expect(JSON.stringify(plan.drafts)).not.toContain('JBSWY3DPEHPK3PXP')
    expect(news).toMatchObject({ serviceName: 'news.example', password: 'pw-n' })
    expect(news!.accountName).toBeUndefined()
  })

  it('今ある件・同じファイルの前の行と同じものはとばす(ホスト名とアカウント名で比べる)', () => {
    const existing = [
      entry({ serviceName: '別の名前', url: 'https://example.com/', accountName: 'TARO' }),
    ]
    const csv = `${CHROME}\nShop again,https://shop.example/x,hanako@example.jp,other,`
    const plan = planImport(csv, existing)
    expect(plan.duplicates).toBe(2)
    expect(plan.drafts.map((d) => d.serviceName)).toEqual(['Shop', 'app'])
  })

  it('URL の無い件は、サービス名で比べる', () => {
    expect(sameKey(entry({ serviceName: ' app ', accountName: 'jiro' }))).toBe(
      sameKey({ serviceName: 'APP', accountName: 'jiro' }),
    )
  })

  it('列の数が違う・名前も URL も無い・大きすぎる行は読めない行。ログインの情報の無い行は取り込まない', () => {
    const csv = [
      'name,url,username,password,note',
      'short,https://a.example/',
      ',,taro,pw,',
      'empty,https://b.example/,,,memo',
      `big,https://c.example/,u,pw,${'x'.repeat(70 * 1024)}`,
      'ok,https://d.example/,u,pw,',
    ].join('\n')
    const plan = planImport(csv, [])
    expect(plan).toMatchObject({ unreadable: 3, notLogin: 1, duplicates: 0 })
    expect(plan.drafts.map((d) => d.serviceName)).toEqual(['ok'])
  })
})

describe('足す', () => {
  afterEach(() => vi.restoreAllMocks())
  const vault = {} as OpenVault

  it('1 件ずつ足し、上限に達したら止める', async () => {
    let n = 0
    const add = vi.spyOn(entries, 'addEntry').mockImplementation(async (_v, draft) => {
      if (++n > 2) throw new ApiError(409, 'limit_reached')
      return { id: String(n), version: 1, entry: { ...draft, createdAt: '', updatedAt: '' } }
    })
    const drafts = planImport(CHROME, []).drafts
    const progress: number[] = []
    const result = await runImport(vault, drafts, (done) => progress.push(done))
    expect(result).toEqual({ added: 2, stoppedAtLimit: true })
    expect(add).toHaveBeenCalledTimes(3)
    expect(progress).toEqual([0, 1, 2, 3])
  })

  it('ほかの失敗はそのまま投げる', async () => {
    vi.spyOn(entries, 'addEntry').mockRejectedValue(new ApiError(401, 'invalid_session'))
    await expect(runImport(vault, planImport(CHROME, []).drafts)).rejects.toThrow(ApiError)
  })
})
