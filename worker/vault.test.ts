// 金庫を作る・開ける・閉じる・回復の API のテスト(Dev Spec 10 章のステップ 3:
// 失敗の回数・待たせる・他人のトークンを弾く)。手元の D1 を使う
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../src/shared/base64.ts'
import { DEFAULT_KDF_PARAMS } from '../src/shared/kdf-params.ts'
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS } from '../src/shared/api-types.ts'
import { requireSession, SESSION_LIMITS } from './session.ts'
import { BASE_NOW, caller, randomBase64, startDb, type CallOptions } from './testing.ts'

let db: Awaited<ReturnType<typeof startDb>>
let call: ReturnType<typeof caller>

beforeAll(async () => {
  db = await startDb()
  call = caller(db.db)
})
afterAll(() => db.dispose())
beforeEach(() => db.reset())

const rand = randomBase64
const at = (ms: number) => new Date(BASE_NOW.getTime() + ms)
const OTHER: CallOptions = { env: { DEV_ACCESS_EMAIL: 'other@example.com' } }
const bearer = (token: string, o: CallOptions = {}): CallOptions => ({
  ...o,
  headers: { ...o.headers, Authorization: `Bearer ${token}` },
})

function vaultBody() {
  return {
    kdfParams: DEFAULT_KDF_PARAMS,
    salt: rand(16),
    authToken: rand(32),
    wrappedKey: rand(60),
    recoverySalt: rand(16),
    recoveryAuthToken: rand(32),
    recoveryWrappedKey: rand(60),
    settings: rand(40),
  }
}

async function createVault(o: CallOptions = {}) {
  const body = vaultBody()
  const res = await call('POST', '/api/vault', body, o)
  expect(res.status).toBe(201)
  return { body, token: res.body.token as string }
}

const unlock = (authToken: string, o: CallOptions = {}) =>
  call('POST', '/api/unlock', { authToken }, o)
const recover = (recoveryAuthToken: string, o: CallOptions = {}) =>
  call('POST', '/api/recover', { recoveryAuthToken }, o)

describe('金庫を作る', () => {
  it('作れて、/api/me に kdf_params・salt が出る。D1 に合言葉そのものは置かない', async () => {
    const { body, token } = await createVault()
    expect(token).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    const me = await call('GET', '/api/me')
    expect(me.body.vault).toEqual({
      kdfParams: DEFAULT_KDF_PARAMS,
      salt: body.salt,
      recoverySalt: body.recoverySalt,
      lockedUntil: null,
      passkeys: { state: 'none' },
    })
    const row = await db.db.prepare('SELECT auth_hash, recovery_auth_hash FROM users').first<{
      auth_hash: ArrayBuffer
      recovery_auth_hash: ArrayBuffer
    }>()
    expect(toBase64(row!.auth_hash)).not.toBe(body.authToken)
    expect(toBase64(row!.recovery_auth_hash)).not.toBe(body.recoveryAuthToken)
  })

  it('すでにあれば 409 で、前の金庫はそのまま', async () => {
    const { body } = await createVault()
    const again = await call('POST', '/api/vault', vaultBody())
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ error: 'vault_exists' })
    expect((await unlock(body.authToken)).status).toBe(200)
  })

  it('形の違う本文は 400(長さ・base64・弱い kdf_params・設定の大きさ)', async () => {
    const cases: Array<Record<string, unknown>> = [
      { salt: rand(8) },
      { authToken: rand(31) },
      { wrappedKey: 'not base64!' },
      { recoveryWrappedKey: undefined },
      { kdfParams: { ...DEFAULT_KDF_PARAMS, m: 1024 } },
      { kdfParams: { ...DEFAULT_KDF_PARAMS, t: 1 } },
      { settings: rand(64 * 1024 + 1) },
    ]
    for (const patch of cases) {
      const res = await call('POST', '/api/vault', { ...vaultBody(), ...patch })
      expect({ patch: Object.keys(patch), status: res.status }).toEqual({
        patch: Object.keys(patch),
        status: 400,
      })
    }
    expect((await call('GET', '/api/me')).body.vault).toBeNull()
  })

  it('本文が JSON でなければ 400、大きすぎれば 413', async () => {
    const res = await call('POST', '/api/vault', 'x'.repeat(10))
    expect(res.status).toBe(400)
    const big = await call('POST', '/api/vault', { ...vaultBody(), pad: 'x'.repeat(256 * 1024) })
    expect(big.status).toBe(413)
  })
})

describe('金庫を開ける', () => {
  it('合言葉が合えば、トークン・包んだ金庫の鍵・設定を返す', async () => {
    const { body } = await createVault()
    const res = await unlock(body.authToken)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      token: expect.stringMatching(/^[A-Za-z0-9+/]{43}=$/),
      wrappedKey: body.wrappedKey,
      settings: body.settings,
      settingsVersion: 1,
    })
  })

  it('回復の合言葉では、金庫を開けられない', async () => {
    const { body } = await createVault()
    expect((await unlock(body.recoveryAuthToken)).status).toBe(403)
  })

  it('金庫が無ければ 404', async () => {
    expect((await unlock(rand(32))).body).toEqual({ error: 'no_vault' })
  })

  it(`${MAX_FAILED_ATTEMPTS - 1} 回続けて間違えても開けられ、開けたら回数が 0 に戻る`, async () => {
    const { body } = await createVault()
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      const res = await unlock(rand(32))
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'wrong_secret' })
    }
    expect((await unlock(body.authToken)).status).toBe(200)
    // 0 に戻ったので、また 9 回間違えても待たされない
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) await unlock(rand(32))
    expect((await unlock(body.authToken)).status).toBe(200)
  })

  it(`${MAX_FAILED_ATTEMPTS} 回続けて間違えると 1 時間待たせ、その間は正しくても開けない`, async () => {
    const { body } = await createVault()
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) await unlock(rand(32))
    const tenth = await unlock(rand(32))
    expect(tenth.status).toBe(429)
    expect(tenth.body).toEqual({ error: 'locked', lockedUntil: BASE_NOW.getTime() + LOCKOUT_MS })

    const during = await unlock(body.authToken, { now: at(LOCKOUT_MS - 1) })
    expect(during.status).toBe(429)
    expect(during.body.lockedUntil).toBe(BASE_NOW.getTime() + LOCKOUT_MS)
    const me = await call('GET', '/api/me', undefined, { now: at(1000) })
    expect(me.body.vault.lockedUntil).toBe(BASE_NOW.getTime() + LOCKOUT_MS)

    // 待たせている間の試みは数えないので、時間がたてばすぐ開ける
    const after = await unlock(body.authToken, { now: at(LOCKOUT_MS) })
    expect(after.status).toBe(200)
    expect(
      (await call('GET', '/api/me', undefined, { now: at(LOCKOUT_MS) })).body.vault.lockedUntil,
    ).toBeNull()
  })

  it('同時にたくさん送られても、待たせるまでに比べるのは 10 回まで', async () => {
    const { body } = await createVault()
    const results = await Promise.all(Array.from({ length: 25 }, () => unlock(rand(32))))
    const wrong = results.filter((r) => r.status === 403).length
    const locked = results.filter((r) => r.status === 429).length
    expect(wrong).toBeLessThanOrEqual(MAX_FAILED_ATTEMPTS - 1)
    expect(wrong + locked).toBe(25)
    expect((await unlock(body.authToken)).status).toBe(429)
  })

  it('ほかの利用者の失敗は、自分の回数に入らない', async () => {
    const mine = await createVault()
    await createVault(OTHER)
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await unlock(rand(32), OTHER)
    expect((await unlock(rand(32), OTHER)).status).toBe(429)
    expect((await unlock(mine.body.authToken)).status).toBe(200)
  })
})

describe('セッション', () => {
  it('閉じる(/api/lock)と、そのトークンは使えなくなる', async () => {
    const { token } = await createVault()
    expect((await call('POST', '/api/lock', undefined, bearer(token))).status).toBe(200)
    const again = await call('POST', '/api/lock', undefined, bearer(token))
    expect(again.status).toBe(401)
    expect(again.body).toEqual({ error: 'invalid_session' })
  })

  it('ほかの利用者のトークンは弾く(Access の利用者と結びつける)', async () => {
    const { token } = await createVault()
    await createVault(OTHER)
    const res = await call('POST', '/api/lock', undefined, bearer(token, OTHER))
    expect(res.status).toBe(401)
    // 弾いても、持ち主のトークンは切れていない
    expect((await call('POST', '/api/lock', undefined, bearer(token))).status).toBe(200)
  })

  it('トークンが無い・形が違う・知らないものは 401', async () => {
    await createVault()
    const cases: Array<Record<string, string>> = [
      {},
      { Authorization: 'Bearer' },
      { Authorization: 'Basic abc' },
      { Authorization: `Bearer ${rand(16)}` },
      { Authorization: `Bearer ${rand(32)}` },
    ]
    for (const h of cases) {
      expect((await call('POST', '/api/lock', undefined, { headers: h })).status).toBe(401)
    }
  })

  it('最後に使ってから 30 分で切れる。使っていれば延びる', async () => {
    const { token } = await createVault()
    const idle = SESSION_LIMITS.vaultIdleMs
    const userId = (await call('GET', '/api/me')).body.userId as string
    // /api/lock は使うと切れるので、トークンの確かめ(requireSession)を直接呼ぶ
    const use = (ms: number) =>
      requireSession(
        new Request('http://localhost/', { headers: { Authorization: `Bearer ${token}` } }),
        db.db,
        userId,
        ['vault'],
        at(ms),
      )
    await use(idle - 1000)
    // 最後に使ってから 30 分たつ前なら、作ってから 30 分を過ぎても使える
    await use(2 * idle - 2000)
    await expect(use(3 * idle - 2000)).rejects.toThrow('invalid_session')
  })

  it('作ってから 12 時間で切れる', async () => {
    const { token } = await createVault()
    const res = await call(
      'POST',
      '/api/lock',
      undefined,
      bearer(token, { now: at(SESSION_LIMITS.vaultMaxMs) }),
    )
    expect(res.status).toBe(401)
  })
})

describe('回復キーで開ける', () => {
  async function recoverToken(body: ReturnType<typeof vaultBody>, o: CallOptions = {}) {
    const res = await recover(body.recoveryAuthToken, o)
    expect(res.status).toBe(200)
    expect(res.body.recoveryWrappedKey).toBe(body.recoveryWrappedKey)
    return res.body.token as string
  }

  const newPassword = () => ({
    kdfParams: DEFAULT_KDF_PARAMS,
    salt: rand(16),
    authToken: rand(32),
    wrappedKey: rand(60),
  })

  it('新しいマスターパスワードに置き換え、前のは使えず、回復キーはそのまま使える', async () => {
    const { body } = await createVault()
    const token = await recoverToken(body)
    const next = newPassword()
    const done = await call('POST', '/api/recover/complete', next, bearer(token))
    expect(done.status).toBe(200)
    expect(done.body).toEqual({
      token: expect.any(String),
      settings: body.settings,
      settingsVersion: 1,
    })

    expect((await unlock(body.authToken)).status).toBe(403)
    const opened = await unlock(next.authToken)
    expect(opened.status).toBe(200)
    expect(opened.body.wrappedKey).toBe(next.wrappedKey)
    const me = await call('GET', '/api/me')
    expect(me.body.vault.salt).toBe(next.salt)
    expect(me.body.vault.recoverySalt).toBe(body.recoverySalt)
    expect((await recover(body.recoveryAuthToken)).status).toBe(200)
  })

  it('置き換えたら、ほかの端末のセッションをすべて切る', async () => {
    const { body, token: firstDevice } = await createVault()
    const secondDevice = (await unlock(body.authToken)).body.token as string
    const token = await recoverToken(body)
    const done = await call('POST', '/api/recover/complete', newPassword(), bearer(token))
    for (const t of [firstDevice, secondDevice, token]) {
      expect((await call('POST', '/api/lock', undefined, bearer(t))).status).toBe(401)
    }
    expect((await call('POST', '/api/lock', undefined, bearer(done.body.token))).status).toBe(200)
  })

  it('回復のトークンでしか置き換えられない(金庫のトークン・ほかの人のトークンは弾く)', async () => {
    const { body, token: vaultToken } = await createVault()
    await createVault(OTHER)
    const token = await recoverToken(body)
    expect(
      (await call('POST', '/api/recover/complete', newPassword(), bearer(vaultToken))).status,
    ).toBe(401)
    expect(
      (await call('POST', '/api/recover/complete', newPassword(), bearer(token, OTHER))).status,
    ).toBe(401)
    expect((await call('POST', '/api/recover/complete', newPassword())).status).toBe(401)
    expect((await unlock(body.authToken)).status).toBe(200)
  })

  it('回復のトークンは 10 分で切れる', async () => {
    const { body } = await createVault()
    const token = await recoverToken(body)
    const late = await call(
      'POST',
      '/api/recover/complete',
      newPassword(),
      bearer(token, { now: at(SESSION_LIMITS.recoverMaxMs) }),
    )
    expect(late.status).toBe(401)
  })

  it('失敗の回数は、マスターパスワードと共有する', async () => {
    const { body } = await createVault()
    for (let i = 0; i < 5; i++) await unlock(rand(32))
    for (let i = 0; i < 4; i++) expect((await recover(rand(32))).status).toBe(403)
    expect((await recover(rand(32))).status).toBe(429)
    expect((await recover(body.recoveryAuthToken)).status).toBe(429)
    expect((await unlock(body.authToken)).status).toBe(429)
  })

  it('マスターパスワードの合言葉では、回復できない', async () => {
    const { body } = await createVault()
    expect((await recover(body.authToken)).status).toBe(403)
  })
})
