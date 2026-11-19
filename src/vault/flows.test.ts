// 画面の側の流れ(作る・開ける・回復)のテスト。サーバーは、合言葉を比べるだけの偽物を fetch の差し替えで置く。
// 本物の Worker の確かめは worker/vault.test.ts で行う
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateVaultRequest } from '../shared/api-types.ts'
import { decryptJson, encryptJson, entryAad } from '../crypto/record.ts'
import { ApiError } from './api.ts'
import {
  commitVault,
  fetchMe,
  finishRecovery,
  prepareVault,
  startRecovery,
  unlockVault,
  type VaultInfo,
} from './flows.ts'
import { checkMasterPassword, loadCommonPasswords } from './password-policy.ts'
import { DEFAULT_SETTINGS, parseSettings } from './settings.ts'

const USER = 'a'.repeat(64)
const PASSWORD = 'aoi-sora-hashiru-neko'

/** 偽のサーバー。置いた値と合言葉を比べるだけ */
function fakeServer() {
  let stored: CreateVaultRequest | null = null
  const calls: string[] = []
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchFake = async (path: string, init: RequestInit = {}) => {
    calls.push(`${init.method} ${path}`)
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, string>) : {}
    switch (path) {
      case '/api/me':
        return reply(200, {
          userId: USER,
          vault: stored && {
            kdfParams: stored.kdfParams,
            salt: stored.salt,
            recoverySalt: stored.recoverySalt,
            lockedUntil: null,
            passkeys: { state: 'none' },
          },
        })
      case '/api/vault':
        stored = body as unknown as CreateVaultRequest
        return reply(201, { token: 'vault-token' })
      case '/api/unlock':
        if (!stored || body['authToken'] !== stored.authToken) {
          return reply(403, { error: 'wrong_secret' })
        }
        return reply(200, {
          token: 'vault-token',
          wrappedKey: stored.wrappedKey,
          settings: stored.settings,
          settingsVersion: 1,
        })
      case '/api/recover':
        if (!stored || body['recoveryAuthToken'] !== stored.recoveryAuthToken) {
          return reply(403, { error: 'wrong_secret' })
        }
        return reply(200, { token: 'recover-token', recoveryWrappedKey: stored.recoveryWrappedKey })
      case '/api/recover/complete':
        stored = { ...stored!, ...body }
        return reply(200, { token: 'vault-token-2', settings: stored.settings, settingsVersion: 1 })
      default:
        return reply(404, { error: 'not_found' })
    }
  }
  return { fetchFake, calls, stored: () => stored }
}

let server: ReturnType<typeof fakeServer>
beforeEach(() => {
  server = fakeServer()
  vi.stubGlobal('fetch', vi.fn(server.fetchFake))
})
afterEach(() => vi.unstubAllGlobals())

async function info(): Promise<VaultInfo> {
  const me = await fetchMe()
  if (!me.vault) throw new Error('金庫が無い')
  return me.vault
}

describe('作る・開ける・回復の流れ', () => {
  it('作った金庫をマスターパスワードで開け、作ったときの鍵の暗号を読める', async () => {
    expect((await fetchMe()).vault).toBeNull()
    const prepared = await prepareVault(USER, PASSWORD)
    // 回復キーを控えたことを確かめるまでは送らない
    expect(server.calls).not.toContain('POST /api/vault')
    expect(prepared.recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
    const created = await commitVault(prepared)
    expect(created.vaultKey.extractable).toBe(false)
    const ct = await encryptJson(created.vaultKey, entryAad(USER, 'e1'), { serviceName: 'A' })

    const opened = await unlockVault(await info(), PASSWORD)
    expect(opened.settings).toEqual(DEFAULT_SETTINGS)
    expect(opened.vaultKey.extractable).toBe(false)
    expect(await decryptJson(opened.vaultKey, entryAad(USER, 'e1'), ct)).toEqual({
      serviceName: 'A',
    })
  })

  it('サーバーに送るものに、マスターパスワードと回復キーは入らない', async () => {
    const prepared = await prepareVault(USER, PASSWORD)
    await commitVault(prepared)
    const sent = JSON.stringify(server.stored())
    expect(sent).not.toContain(PASSWORD)
    expect(sent).not.toContain(prepared.recoveryKey.replace(/-/g, ''))
    expect(sent).not.toContain(prepared.recoveryKey)
  })

  it('違うマスターパスワードでは開かない(サーバーが断る)', async () => {
    await commitVault(await prepareVault(USER, PASSWORD))
    await expect(unlockVault(await info(), PASSWORD + 'x')).rejects.toThrow(ApiError)
  })

  it('回復キーで新しいマスターパスワードに変え、前のデータを読める。回復キーはそのまま使える', async () => {
    const prepared = await prepareVault(USER, PASSWORD)
    const created = await commitVault(prepared)
    const ct = await encryptJson(created.vaultKey, entryAad(USER, 'e1'), { a: 1 })

    // 打ち込みの揺れ(小文字・区切りなし)も受け付ける
    const typed = prepared.recoveryKey.toLowerCase().replace(/-/g, '')
    const r = await startRecovery(await info(), typed)
    expect(r).not.toBeNull()
    const reopened = await finishRecovery(r!, '新しい-マスター-パスワード')
    expect(await decryptJson(reopened.vaultKey, entryAad(USER, 'e1'), ct)).toEqual({ a: 1 })

    await expect(unlockVault(await info(), PASSWORD)).rejects.toThrow(ApiError)
    const opened = await unlockVault(await info(), '新しい-マスター-パスワード')
    expect(await decryptJson(opened.vaultKey, entryAad(USER, 'e1'), ct)).toEqual({ a: 1 })
    expect(await startRecovery(await info(), prepared.recoveryKey)).not.toBeNull()
  })

  it('形の違う回復キーは、サーバーに送らずに null を返す', async () => {
    await commitVault(await prepareVault(USER, PASSWORD))
    const before = server.calls.length
    expect(await startRecovery(await info(), 'ABCD-EFGH')).toBeNull()
    expect(server.calls.slice(before)).toEqual(['GET /api/me'])
  })

  it('サーバーから弱い kdf_params を渡されたら、鍵を作らない', async () => {
    await commitVault(await prepareVault(USER, PASSWORD))
    const s = server.stored()!
    s.kdfParams = { ...s.kdfParams, m: 8 }
    await expect(fetchMe()).rejects.toThrow('kdf_params')
  })
})

describe('マスターパスワードの基準', () => {
  it('12 文字以上を求める(絵文字や日本語も 1 文字と数える)', () => {
    expect(checkMasterPassword('a'.repeat(11), new Set())).toMatch('12 文字以上')
    expect(checkMasterPassword('a'.repeat(12), new Set())).toBeNull()
    expect(checkMasterPassword('🔑'.repeat(11), new Set())).toMatch('12 文字以上')
    expect(checkMasterPassword('あいうえおかきくけこさし', new Set())).toBeNull()
  })

  it('一覧にあるものは断る(大文字・小文字を問わない)', () => {
    const list = new Set(['password1234'])
    expect(checkMasterPassword('PassWord1234', list)).toMatch('よく使われている')
    expect(checkMasterPassword('password12345', list)).toBeNull()
  })

  it('同梱の一覧(SecLists から取り出した 12 文字以上の 1 万件)で、長くても弱いものを断る', async () => {
    const common = await loadCommonPasswords()
    expect(common.size).toBeGreaterThan(9900)
    for (const p of common) expect(p.length).toBeGreaterThanOrEqual(12)
    expect(checkMasterPassword('QWERTY123456', common)).toMatch('よく使われている')
    expect(checkMasterPassword('1qaz2wsx3edc', common)).toMatch('よく使われている')
    expect(checkMasterPassword('aoi-sora-hashiru-neko', common)).toBeNull()
    // 説明の行(# で始まる)は一覧に入らない
    expect([...common].some((p) => p.startsWith('#'))).toBe(false)
  })
})

describe('設定', () => {
  it('知らない値は初期値にする', () => {
    expect(parseSettings({ schema: 1, autoLockMinutes: 15 })).toEqual({
      schema: 1,
      autoLockMinutes: 15,
    })
    expect(parseSettings({ autoLockMinutes: 999 })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
})
