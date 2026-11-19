// 設定の画面で使う API のテスト(Dev Spec 10 章のステップ 5)。手元の D1 を使う
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MAX_FAILED_ATTEMPTS } from '../src/shared/api-types.ts'
import { DEFAULT_KDF_PARAMS } from '../src/shared/kdf-params.ts'
import { caller, randomBase64 as rand, startDb, type CallOptions } from './testing.ts'

let db: Awaited<ReturnType<typeof startDb>>
let call: ReturnType<typeof caller>

beforeAll(async () => {
  db = await startDb()
  call = caller(db.db)
})
afterAll(() => db.dispose())
beforeEach(() => db.reset())

const OTHER: CallOptions = { env: { DEV_ACCESS_EMAIL: 'other@example.com' } }

async function setup(o: CallOptions = {}) {
  const vault = {
    kdfParams: DEFAULT_KDF_PARAMS,
    salt: rand(16),
    authToken: rand(32),
    wrappedKey: rand(60),
    recoverySalt: rand(16),
    recoveryAuthToken: rand(32),
    recoveryWrappedKey: rand(60),
    settings: rand(40),
  }
  const res = await call('POST', '/api/vault', vault, o)
  expect(res.status).toBe(201)
  const token = res.body.token as string
  const as = (t: string) => (method: string, path: string, body?: unknown) =>
    call(method, path, body, { ...o, headers: { Authorization: `Bearer ${t}` } })
  return { vault, token, api: as(token), as }
}

const unlock = (authToken: string, o: CallOptions = {}) =>
  call('POST', '/api/unlock', { authToken }, o)

describe('設定を直す', () => {
  it('版を進めて置き換え、開けたときに新しい設定が返る', async () => {
    const { vault, api } = await setup()
    const next = rand(40)
    const res = await api('PUT', '/api/settings', { expectedVersion: 1, settings: next })
    expect(res.body).toEqual({ version: 2 })
    const opened = await unlock(vault.authToken)
    expect(opened.body.settings).toBe(next)
    expect(opened.body.settingsVersion).toBe(2)
  })

  it('版が違えば 409(ほかの端末で直されたとき)', async () => {
    const { api } = await setup()
    await api('PUT', '/api/settings', { expectedVersion: 1, settings: rand(40) })
    const stale = await api('PUT', '/api/settings', { expectedVersion: 1, settings: rand(40) })
    expect(stale.status).toBe(409)
    expect(stale.body).toEqual({ error: 'version_conflict' })
  })

  it('トークンが要る。形の違う本文は 400', async () => {
    const { api } = await setup()
    expect(
      (await call('PUT', '/api/settings', { expectedVersion: 1, settings: rand(40) })).status,
    ).toBe(401)
    expect(
      (await api('PUT', '/api/settings', { expectedVersion: 0, settings: rand(40) })).status,
    ).toBe(400)
    expect(
      (await api('PUT', '/api/settings', { expectedVersion: 1, settings: rand(10) })).status,
    ).toBe(400)
  })
})

describe('マスターパスワードの変更', () => {
  const next = () => ({
    kdfParams: DEFAULT_KDF_PARAMS,
    salt: rand(16),
    authToken: rand(32),
    wrappedKey: rand(60),
  })

  it('今の合言葉が合えば置き換える。前のは使えず、ほかのセッションは切れ、このセッションは残る', async () => {
    const { vault, api, as } = await setup()
    const otherDevice = as((await unlock(vault.authToken)).body.token)
    const n = next()
    const res = await api('POST', '/api/password', { currentAuthToken: vault.authToken, ...n })
    expect(res.status).toBe(200)

    expect((await unlock(vault.authToken)).status).toBe(403)
    const opened = await unlock(n.authToken)
    expect(opened.body.wrappedKey).toBe(n.wrappedKey)
    expect((await call('GET', '/api/me')).body.vault.salt).toBe(n.salt)
    expect((await otherDevice('GET', '/api/entries')).status).toBe(401)
    expect((await api('GET', '/api/entries')).status).toBe(200)
    // 回復キーはそのまま使える
    expect(
      (await call('POST', '/api/recover', { recoveryAuthToken: vault.recoveryAuthToken })).status,
    ).toBe(200)
  })

  it('今の合言葉が違えば 403 で、何も変わらない', async () => {
    const { vault, api } = await setup()
    const res = await api('POST', '/api/password', { currentAuthToken: rand(32), ...next() })
    expect(res.status).toBe(403)
    expect((await unlock(vault.authToken)).status).toBe(200)
  })

  it('合言葉だけを送っても、先に確かめて回数に数える(違えば 403、合えば残りが無いので 400)', async () => {
    const { vault, api } = await setup()
    expect((await api('POST', '/api/password', { currentAuthToken: rand(32) })).status).toBe(403)
    expect((await api('POST', '/api/password', { currentAuthToken: vault.authToken })).status).toBe(
      400,
    )
    expect((await unlock(vault.authToken)).status).toBe(200)
  })

  it(`今の合言葉の失敗も、金庫を開けるときと同じく数え、${MAX_FAILED_ATTEMPTS} 回で待たせる`, async () => {
    const { vault, api } = await setup()
    for (let i = 0; i < 5; i++) await unlock(rand(32))
    for (let i = 0; i < 4; i++) {
      expect((await api('POST', '/api/password', { currentAuthToken: rand(32) })).status).toBe(403)
    }
    const tenth = await api('POST', '/api/password', { currentAuthToken: rand(32) })
    expect(tenth.status).toBe(429)
    expect((await unlock(vault.authToken)).status).toBe(429)
    expect(
      (await api('POST', '/api/password', { currentAuthToken: vault.authToken, ...next() })).status,
    ).toBe(429)
  })

  it('ほかの人のトークンでは変えられない', async () => {
    const { vault, token } = await setup()
    await setup(OTHER)
    const res = await call(
      'POST',
      '/api/password',
      { currentAuthToken: vault.authToken, ...next() },
      { ...OTHER, headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(401)
  })
})

describe('回復キーの作り直し', () => {
  it('新しい回復キーに置き換え、古い回復キーは使えなくなる。セッションは切らない', async () => {
    const { vault, api, as } = await setup()
    const otherDevice = as((await unlock(vault.authToken)).body.token)
    const n = { recoverySalt: rand(16), recoveryAuthToken: rand(32), recoveryWrappedKey: rand(60) }
    const res = await api('POST', '/api/recovery-key', { currentAuthToken: vault.authToken, ...n })
    expect(res.status).toBe(200)
    expect(
      (await call('POST', '/api/recover', { recoveryAuthToken: vault.recoveryAuthToken })).status,
    ).toBe(403)
    const rec = await call('POST', '/api/recover', { recoveryAuthToken: n.recoveryAuthToken })
    expect(rec.body.recoveryWrappedKey).toBe(n.recoveryWrappedKey)
    expect((await call('GET', '/api/me')).body.vault.recoverySalt).toBe(n.recoverySalt)
    expect((await otherDevice('GET', '/api/entries')).status).toBe(200)
  })

  it('今の合言葉が違えば 403 で、古い回復キーのまま', async () => {
    const { vault, api } = await setup()
    const n = { recoverySalt: rand(16), recoveryAuthToken: rand(32), recoveryWrappedKey: rand(60) }
    expect(
      (await api('POST', '/api/recovery-key', { currentAuthToken: rand(32), ...n })).status,
    ).toBe(403)
    expect(
      (await call('POST', '/api/recover', { recoveryAuthToken: vault.recoveryAuthToken })).status,
    ).toBe(200)
  })
})

describe('全データの削除', () => {
  it('件・セッション・金庫をすべて消す。ほかの人のデータは残る', async () => {
    const { vault, api } = await setup()
    const theirs = await setup(OTHER)
    await api('POST', '/api/entries', { id: crypto.randomUUID(), ciphertext: rand(100) })
    await theirs.api('POST', '/api/entries', { id: crypto.randomUUID(), ciphertext: rand(100) })

    const res = await api('POST', '/api/delete-all', { currentAuthToken: vault.authToken })
    expect(res.status).toBe(200)
    expect((await call('GET', '/api/me')).body.vault).toBeNull()
    expect((await api('GET', '/api/entries')).status).toBe(401)
    const count = await db.db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM entries) AS e, (SELECT COUNT(*) FROM sessions) AS s',
      )
      .first<{ u: number; e: number; s: number }>()
    expect(count).toEqual({ u: 1, e: 1, s: 1 })
    expect((await theirs.api('GET', '/api/entries')).body.entries).toHaveLength(1)
    // 消したあと、同じ人がまた金庫を作れる
    expect((await setup()).token).toBeTruthy()
  })

  it('今の合言葉が違えば 403 で、何も消さない', async () => {
    const { vault, api } = await setup()
    expect((await api('POST', '/api/delete-all', { currentAuthToken: rand(32) })).status).toBe(403)
    expect((await unlock(vault.authToken)).status).toBe(200)
  })
})

describe('バックアップの鍵', () => {
  it('今の合言葉が合えば、包んだ鍵と塩を返す(回復で包んだ鍵も)', async () => {
    const { vault, api } = await setup()
    const res = await api('POST', '/api/backup-keys', { currentAuthToken: vault.authToken })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      kdfParams: vault.kdfParams,
      salt: vault.salt,
      wrappedKey: vault.wrappedKey,
      recoverySalt: vault.recoverySalt,
      recoveryWrappedKey: vault.recoveryWrappedKey,
    })
  })

  it('今の合言葉が違えば 403 で、何も返さない。失敗の回数に数える', async () => {
    const { api } = await setup()
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      const res = await api('POST', '/api/backup-keys', { currentAuthToken: rand(32) })
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'wrong_secret' })
    }
    const last = await api('POST', '/api/backup-keys', { currentAuthToken: rand(32) })
    expect(last.status).toBe(429)
  })

  it('トークンが要る。ほかの人のトークンでは自分の鍵は取れない', async () => {
    const { vault } = await setup()
    const theirs = await setup(OTHER)
    expect(
      (await call('POST', '/api/backup-keys', { currentAuthToken: vault.authToken })).status,
    ).toBe(401)
    const res = await theirs.api('POST', '/api/backup-keys', { currentAuthToken: vault.authToken })
    expect(res.status).toBe(403)
  })
})
