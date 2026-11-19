// 応答の形の確かめ(responses.ts)と、api.ts がそれを bad_response にすること
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_KDF_PARAMS } from '../shared/kdf-params.ts'
import { api, ApiError } from './api.ts'
import {
  BadResponseError,
  parseBackupKeys,
  parseListEntries,
  parseMe,
  parseUnlock,
} from './responses.ts'

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('応答の形', () => {
  it('決めた項目だけを取り出し、余分な項目は捨てる', () => {
    expect(
      parseUnlock({ token: 't', wrappedKey: 'w', settings: 's', settingsVersion: 2, extra: 1 }),
    ).toEqual({ token: 't', wrappedKey: 'w', settings: 's', settingsVersion: 2 })
  })

  it('項目が欠けている・型が違うと、どこが違うかを添えて投げる', () => {
    expect(() => parseUnlock({ token: 't', wrappedKey: 'w', settings: 's' })).toThrow(
      new BadResponseError('$.settingsVersion'),
    )
    expect(() =>
      parseListEntries({ entries: [{ id: 'a', version: '1', ciphertext: 'c' }] }),
    ).toThrow(new BadResponseError('$.entries[0].version'))
    expect(() => parseListEntries(null)).toThrow(BadResponseError)
    expect(() => parseListEntries([])).toThrow(BadResponseError)
  })

  it('金庫が無い /api/me と、パスキーの 3 つの状態を受ける', () => {
    expect(parseMe({ userId: 'u', vault: null })).toEqual({ userId: 'u', vault: null })
    const vault = { kdfParams: DEFAULT_KDF_PARAMS, salt: 's', recoverySalt: 'r', lockedUntil: null }
    for (const passkeys of [
      { state: 'none' },
      { state: 'password_due' },
      { state: 'available', credentials: [{ id: 'i', prfSalt: 'p' }] },
    ]) {
      expect(parseMe({ userId: 'u', vault: { ...vault, passkeys } }).vault?.passkeys).toEqual(
        passkeys,
      )
    }
    expect(() =>
      parseMe({ userId: 'u', vault: { ...vault, passkeys: { state: 'available' } } }),
    ).toThrow(BadResponseError)
    expect(() => parseMe({ userId: 'u', vault: { ...vault, passkeys: { state: 'x' } } })).toThrow(
      new BadResponseError('$.vault.passkeys.state'),
    )
  })

  it('バックアップの鍵の kdf_params は、受け付ける範囲の中だけ', () => {
    const keys = { salt: 's', wrappedKey: 'w', recoverySalt: 'r', recoveryWrappedKey: 'rw' }
    expect(parseBackupKeys({ ...keys, kdfParams: DEFAULT_KDF_PARAMS }).kdfParams).toEqual(
      DEFAULT_KDF_PARAMS,
    )
    expect(() =>
      parseBackupKeys({ ...keys, kdfParams: { ...DEFAULT_KDF_PARAMS, m: 1024 } }),
    ).toThrow(new BadResponseError('$.kdfParams'))
  })
})

describe('api の応答の扱い', () => {
  it('形の違う応答は ApiError の bad_response にする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(200, { token: 1 })),
    )
    const err = await api('POST', '/api/unlock', { parse: parseUnlock }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('bad_response')
    expect((err as ApiError).status).toBe(200)
  })

  it('parse を渡さなければ、成功したかだけを見る', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(200, { anything: true })),
    )
    await expect(api('POST', '/api/lock')).resolves.toBeUndefined()
  })

  it('失敗の応答は、これまでどおり理由の種類の ApiError にする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(429, { error: 'locked', lockedUntil: 5 })),
    )
    const err = (await api('POST', '/api/unlock', { parse: parseUnlock }).catch(
      (e: unknown) => e,
    )) as ApiError
    expect([err.status, err.code, err.lockedUntil]).toEqual([429, 'locked', 5])
  })
})
