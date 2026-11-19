// 設定の画面の流れのテスト(ステップ 5)。サーバーは、合言葉を比べるだけの偽物を fetch の差し替えで置く
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptJson, encryptJson, entryAad, settingsAad } from '../crypto/record.ts'
import type { CreateVaultRequest } from '../shared/api-types.ts'
import { fromBase64 } from '../shared/base64.ts'
import { ApiError } from './api.ts'
import {
  changeMasterPassword,
  commitRecoveryKey,
  commitVault,
  deleteAllData,
  fetchMe,
  finishRecovery,
  prepareRecoveryKey,
  prepareVault,
  saveSettings,
  startRecovery,
  unlockVault,
  type VaultInfo,
} from './flows.ts'

const USER = 'b'.repeat(64)
const PW = 'aoi-sora-hashiru-neko'
const PW2 = 'midori-umi-oyogu-inu'

function fakeServer() {
  let v: (CreateVaultRequest & { settingsVersion: number }) | null = null
  const bodies: Array<{ path: string; body: Record<string, unknown> }> = []
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const wrong = () => reply(403, { error: 'wrong_secret' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const body = (init.body ? JSON.parse(init.body as string) : {}) as Record<string, string>
      bodies.push({ path, body })
      if (path === '/api/me') {
        return reply(200, {
          userId: USER,
          vault: v && {
            kdfParams: v.kdfParams,
            salt: v.salt,
            recoverySalt: v.recoverySalt,
            lockedUntil: null,
            passkeys: { state: 'none' },
          },
        })
      }
      if (path === '/api/vault') {
        v = { ...(body as unknown as CreateVaultRequest), settingsVersion: 1 }
        return reply(201, { token: 't' })
      }
      if (!v) return reply(404, { error: 'no_vault' })
      switch (path) {
        case '/api/unlock':
          if (body['authToken'] !== v.authToken) return wrong()
          return reply(200, {
            token: 't',
            wrappedKey: v.wrappedKey,
            settings: v.settings,
            settingsVersion: v.settingsVersion,
          })
        case '/api/recover':
          if (body['recoveryAuthToken'] !== v.recoveryAuthToken) return wrong()
          return reply(200, { token: 'r', recoveryWrappedKey: v.recoveryWrappedKey })
        case '/api/recover/complete':
          v = { ...v, ...body }
          return reply(200, {
            token: 't',
            settings: v.settings,
            settingsVersion: v.settingsVersion,
          })
        case '/api/settings':
          if (Number(body['expectedVersion']) !== v.settingsVersion) {
            return reply(409, { error: 'version_conflict' })
          }
          v = { ...v, settings: body['settings']!, settingsVersion: v.settingsVersion + 1 }
          return reply(200, { version: v.settingsVersion })
        case '/api/password':
        case '/api/recovery-key':
        case '/api/delete-all': {
          if (body['currentAuthToken'] !== v.authToken) return wrong()
          const { currentAuthToken: _, ...rest } = body
          if (path === '/api/delete-all') {
            v = null
            return reply(200, { ok: true })
          }
          if (Object.keys(rest).length === 0) return reply(400, { error: 'bad_request' })
          v = { ...v, ...rest }
          return reply(200, { ok: true })
        }
      }
      return reply(404, { error: 'not_found' })
    }),
  )
  return { bodies, vault: () => v }
}

let server: ReturnType<typeof fakeServer>
beforeEach(() => {
  server = fakeServer()
})
afterEach(() => vi.unstubAllGlobals())

async function info(): Promise<VaultInfo> {
  const me = await fetchMe()
  if (!me.vault) throw new Error('金庫が無い')
  return me.vault
}

async function created() {
  const prepared = await prepareVault(USER, PW)
  return { vault: await commitVault(prepared), recoveryKey: prepared.recoveryKey }
}

describe('設定', () => {
  it('自動で閉じる時間を暗号にして保存し、開け直すと戻る', async () => {
    const { vault } = await created()
    const saved = await saveSettings(vault, { ...vault.settings, autoLockMinutes: 15 })
    expect(saved.settingsVersion).toBe(2)
    // 送ったものは暗号で、平文の JSON は入っていない(base64 の文字列に「15」が偶然入ることはあるので、バイト列で比べる)
    const sent = new TextDecoder('latin1').decode(fromBase64(server.vault()!.settings)!)
    expect(sent).not.toContain('autoLockMinutes')
    expect(
      await decryptJson(saved.vaultKey, settingsAad(USER), fromBase64(server.vault()!.settings)!),
    ).toEqual({ schema: 1, autoLockMinutes: 15 })
    const reopened = await unlockVault(await info(), PW)
    expect(reopened.settings.autoLockMinutes).toBe(15)
    // 古い版のまま保存すると 409
    await expect(saveSettings(vault, vault.settings)).rejects.toThrow(
      new ApiError(409, 'version_conflict'),
    )
  })
})

describe('マスターパスワードの変更', () => {
  it('変えたあとは新しいパスワードで開け、前のデータを読める。回復キーもそのまま使える', async () => {
    const { vault, recoveryKey } = await created()
    const ct = await encryptJson(vault.vaultKey, entryAad(USER, 'e1'), { a: 1 })
    const changed = await changeMasterPassword(vault, PW, PW2)
    // 開いている金庫は、続けて使える(包み直しても金庫の鍵は同じ)
    expect(await decryptJson(changed.vaultKey, entryAad(USER, 'e1'), ct)).toEqual({ a: 1 })

    await expect(unlockVault(await info(), PW)).rejects.toThrow(ApiError)
    const opened = await unlockVault(await info(), PW2)
    expect(await decryptJson(opened.vaultKey, entryAad(USER, 'e1'), ct)).toEqual({ a: 1 })
    expect(await startRecovery(await info(), recoveryKey)).not.toBeNull()
    // 続けてもう一度変えられる(新しい salt と包んだ鍵を持っている)
    await changeMasterPassword(changed, PW2, PW)
    expect((await unlockVault(await info(), PW)).userId).toBe(USER)
  })

  it('今のパスワードが違えば、合言葉だけを送って回数に数えさせ、何も変えない', async () => {
    const { vault } = await created()
    const before = server.vault()!.wrappedKey
    await expect(changeMasterPassword(vault, 'wrong-password-123', PW2)).rejects.toThrow(
      new ApiError(403, 'wrong_secret'),
    )
    const sent = server.bodies.at(-1)!
    expect(sent.path).toBe('/api/password')
    expect(Object.keys(sent.body)).toEqual(['currentAuthToken'])
    expect(server.vault()!.wrappedKey).toBe(before)
  })
})

describe('回復キーの作り直し', () => {
  it('新しい回復キーで回復でき、古い回復キーは使えない', async () => {
    const { vault, recoveryKey: old } = await created()
    const ct = await encryptJson(vault.vaultKey, entryAad(USER, 'e1'), { a: 1 })
    const prepared = await prepareRecoveryKey(vault, PW)
    expect(prepared.recoveryKey).not.toBe(old)
    // 控えたことを確かめるまでは、送らない
    expect(server.bodies.at(-1)!.path).not.toBe('/api/recovery-key')
    await commitRecoveryKey(vault, prepared)

    await expect(startRecovery(await info(), old)).rejects.toThrow(ApiError)
    const r = await startRecovery(await info(), prepared.recoveryKey)
    const reopened = await finishRecovery(r!, PW2)
    expect(await decryptJson(reopened.vaultKey, entryAad(USER, 'e1'), ct)).toEqual({ a: 1 })
  })

  it('今のパスワードが違えば、合言葉だけを送って回数に数えさせる', async () => {
    const { vault } = await created()
    await expect(prepareRecoveryKey(vault, 'wrong-password-123')).rejects.toThrow(ApiError)
    const sent = server.bodies.at(-1)!
    expect(sent.path).toBe('/api/recovery-key')
    expect(Object.keys(sent.body)).toEqual(['currentAuthToken'])
  })
})

describe('全データの削除', () => {
  it('今のパスワードが合えば消え、金庫が無い状態に戻る', async () => {
    const { vault } = await created()
    await expect(deleteAllData(vault, 'wrong-password-123')).rejects.toThrow(ApiError)
    expect((await fetchMe()).vault).not.toBeNull()
    await deleteAllData(vault, PW)
    expect((await fetchMe()).vault).toBeNull()
  })
})
