// パスキーの登録・一覧・削除の API のテスト(Dev Spec 17 章)。手元の D1 を使う
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MAX_PASSKEYS } from '../src/shared/api-types.ts'
import { DEFAULT_KDF_PARAMS } from '../src/shared/kdf-params.ts'
import { BASE_NOW, caller, randomBase64 as rand, startDb, type CallOptions } from './testing.ts'

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
  const api = (method: string, path: string, body?: unknown) =>
    call(method, path, body, { ...o, headers: { Authorization: `Bearer ${token}` } })
  return { vault, api }
}

let n = 0
/** base64url の credential ID(テストごとに違う値) */
const credId = () => `cred-${String(++n).padStart(4, '0')}-abcdefghijklmn_`

const passkey = (currentAuthToken: string, over: Record<string, unknown> = {}) => ({
  currentAuthToken,
  credentialId: credId(),
  nameCiphertext: rand(60),
  prfSalt: rand(32),
  authToken: rand(32),
  wrappedKey: rand(60),
  ...over,
})

describe('パスキーを登録する', () => {
  it('今のマスターパスワードの合言葉を確かめて登録し、一覧に暗号にした名前と登録した日だけが出る', async () => {
    const { vault, api } = await setup()
    const body = passkey(vault.authToken)
    expect((await api('POST', '/api/passkeys', body)).status).toBe(201)
    const list = await api('GET', '/api/passkeys')
    expect(list.status).toBe(200)
    expect(list.body).toEqual({
      passkeys: [
        {
          id: body.credentialId,
          nameCiphertext: body.nameCiphertext,
          legacyName: null,
          createdAt: expect.any(Number),
        },
      ],
    })
    // D1 の name の列は空(暗号でない名前を置かない。discussion47 の 1)
    const row = await db.db.prepare('SELECT name FROM passkeys').first<{ name: string }>()
    expect(row?.name).toBe('')
    expect(JSON.stringify(list.body)).not.toContain(body.wrappedKey)
  })

  it('今のマスターパスワードが違えば 403 で、失敗の回数に数える', async () => {
    const { api } = await setup()
    const res = await api('POST', '/api/passkeys', passkey(rand(32)))
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'wrong_secret' })
    expect((await api('GET', '/api/passkeys')).body.passkeys).toEqual([])
    const row = await db.db
      .prepare('SELECT failed_count FROM users')
      .first<{ failed_count: number }>()
    expect(row?.failed_count).toBe(1)
  })

  it(`${MAX_PASSKEYS} つまで。超えたら 409 limit_reached。同じ ID は 409 passkey_exists`, async () => {
    const { vault, api } = await setup()
    const first = passkey(vault.authToken)
    expect((await api('POST', '/api/passkeys', first)).status).toBe(201)
    const dup = await api(
      'POST',
      '/api/passkeys',
      passkey(vault.authToken, { credentialId: first.credentialId }),
    )
    expect(dup.status).toBe(409)
    expect(dup.body).toEqual({ error: 'passkey_exists' })
    for (let i = 1; i < MAX_PASSKEYS; i++) {
      expect((await api('POST', '/api/passkeys', passkey(vault.authToken))).status).toBe(201)
    }
    const over = await api('POST', '/api/passkeys', passkey(vault.authToken))
    expect(over.status).toBe(409)
    expect(over.body).toEqual({ error: 'limit_reached' })
  })

  it('形の違う本文は 400(名前の暗号が無い・短すぎる・大きすぎる・ID の形・値の長さ)', async () => {
    const { vault, api } = await setup()
    for (const over of [
      { nameCiphertext: undefined },
      { nameCiphertext: rand(30) },
      { nameCiphertext: rand(513) },
      { name: 'iPhone', nameCiphertext: undefined },
      { credentialId: 'short' },
      { credentialId: 'has/slash-and-more-chars' },
      { prfSalt: rand(16) },
      { authToken: rand(16) },
      { wrappedKey: rand(59) },
    ]) {
      expect((await api('POST', '/api/passkeys', passkey(vault.authToken, over))).status).toBe(400)
    }
    expect(
      (await api('POST', '/api/passkeys', passkey(vault.authToken, { nameCiphertext: rand(512) })))
        .status,
    ).toBe(201)
  })

  it('前の版の暗号でない名前は一覧で legacyName として返し、PUT で暗号にして置き直せる。ほかの人のものは 404', async () => {
    const { vault, api } = await setup()
    const body = passkey(vault.authToken)
    expect((await api('POST', '/api/passkeys', body)).status).toBe(201)
    // 前の版の行のふり
    await db.db.prepare("UPDATE passkeys SET name = 'iPhone', name_ct = NULL").run()
    const before = await api('GET', '/api/passkeys')
    expect(before.body.passkeys[0]).toMatchObject({ nameCiphertext: null, legacyName: 'iPhone' })
    const ct = rand(60)
    const other = await setup(OTHER)
    expect(
      (await other.api('PUT', `/api/passkeys/${body.credentialId}/name`, { nameCiphertext: ct }))
        .status,
    ).toBe(404)
    expect(
      (await api('PUT', `/api/passkeys/${body.credentialId}/name`, { nameCiphertext: rand(10) }))
        .status,
    ).toBe(400)
    expect(
      (await api('PUT', `/api/passkeys/${body.credentialId}/name`, { nameCiphertext: ct })).status,
    ).toBe(200)
    const after = await api('GET', '/api/passkeys')
    expect(after.body.passkeys[0]).toMatchObject({ nameCiphertext: ct, legacyName: null })
    const row = await db.db.prepare('SELECT name FROM passkeys').first<{ name: string }>()
    expect(row?.name).toBe('')
    expect(
      (await call('PUT', `/api/passkeys/${body.credentialId}/name`, { nameCiphertext: ct })).status,
    ).toBe(401)
  })

  it('トークンが要る', async () => {
    const { vault } = await setup()
    expect((await call('POST', '/api/passkeys', passkey(vault.authToken))).status).toBe(401)
    expect((await call('GET', '/api/passkeys')).status).toBe(401)
  })
})

describe('パスキーの登録を消す', () => {
  it('自分のものだけを消せる。ほかの人のものは 404', async () => {
    const alice = await setup()
    const bob = await setup(OTHER)
    const a = passkey(alice.vault.authToken)
    await alice.api('POST', '/api/passkeys', a)
    const path = `/api/passkeys/${a.credentialId}`
    expect((await bob.api('DELETE', path)).status).toBe(404)
    expect((await alice.api('GET', '/api/passkeys')).body.passkeys).toHaveLength(1)
    expect((await alice.api('DELETE', path)).status).toBe(200)
    expect((await alice.api('GET', '/api/passkeys')).body.passkeys).toEqual([])
    expect((await alice.api('DELETE', path)).status).toBe(404)
  })

  it('全データの削除で、パスキーの登録も消える', async () => {
    const { vault, api } = await setup()
    await api('POST', '/api/passkeys', passkey(vault.authToken))
    expect(
      (await api('POST', '/api/delete-all', { currentAuthToken: vault.authToken })).status,
    ).toBe(200)
    const row = await db.db.prepare('SELECT COUNT(*) AS c FROM passkeys').first<{ c: number }>()
    expect(row?.c).toBe(0)
  })
})

describe('パスキーで開く', () => {
  const DAY = 24 * 60 * 60 * 1000
  const at = (ms: number) => new Date(BASE_NOW.getTime() + ms)

  async function registered() {
    const s = await setup()
    const pk = passkey(s.vault.authToken)
    expect((await s.api('POST', '/api/passkeys', pk)).status).toBe(201)
    return { ...s, pk }
  }

  it('/api/me に、登録したパスキーの ID と PRF に渡す値が出る(登録が無ければ none)', async () => {
    const { vault } = await setup()
    expect((await call('GET', '/api/me')).body.vault.passkeys).toEqual({ state: 'none' })
    const res = await call('POST', '/api/passkeys', passkey(vault.authToken), {
      headers: {
        Authorization: `Bearer ${(await call('POST', '/api/unlock', { authToken: vault.authToken })).body.token}`,
      },
    })
    expect(res.status).toBe(201)
    const me = await call('GET', '/api/me')
    expect(me.body.vault.passkeys).toEqual({
      state: 'available',
      credentials: [{ id: expect.any(String), prfSalt: expect.any(String) }],
    })
  })

  it('合言葉が合えば、トークン・両方の包んだ鍵・設定を返す。失敗の回数を 0 に戻す', async () => {
    const { vault, pk } = await registered()
    await call('POST', '/api/unlock', { authToken: rand(32) })
    const res = await call('POST', '/api/unlock/passkey', {
      credentialId: pk.credentialId,
      authToken: pk.authToken,
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      token: expect.any(String),
      wrappedKey: vault.wrappedKey,
      passkeyWrappedKey: pk.wrappedKey,
      settings: vault.settings,
      settingsVersion: 1,
    })
    const row = await db.db
      .prepare('SELECT failed_count FROM users')
      .first<{ failed_count: number }>()
    expect(row?.failed_count).toBe(0)
  })

  it('合言葉が違う・知らない ID は 403 で、マスターパスワードの失敗と合わせて数える', async () => {
    const { pk } = await registered()
    for (let i = 0; i < 5; i++) await call('POST', '/api/unlock', { authToken: rand(32) })
    const wrong = await call('POST', '/api/unlock/passkey', {
      credentialId: pk.credentialId,
      authToken: rand(32),
    })
    expect(wrong.status).toBe(403)
    expect(wrong.body).toEqual({ error: 'wrong_secret' })
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await call('POST', '/api/unlock/passkey', {
            credentialId: credId(),
            authToken: pk.authToken,
          })
        ).status,
      ).toBe(403)
    }
    // 10 回目で待たせる
    const tenth = await call('POST', '/api/unlock/passkey', {
      credentialId: pk.credentialId,
      authToken: rand(32),
    })
    expect(tenth.status).toBe(429)
    // 待たせている間は、正しくても断る
    expect(
      (
        await call('POST', '/api/unlock/passkey', {
          credentialId: pk.credentialId,
          authToken: pk.authToken,
        })
      ).status,
    ).toBe(429)
  })

  it('最後にマスターパスワードで開いてから 2 週間たつと、password_due(比べない・数えない)', async () => {
    const { vault, pk } = await registered()
    const body = { credentialId: pk.credentialId, authToken: pk.authToken }
    expect(
      (await call('POST', '/api/unlock/passkey', body, { now: at(14 * DAY - 1) })).status,
    ).toBe(200)
    const due = await call('POST', '/api/unlock/passkey', body, { now: at(14 * DAY) })
    expect(due.status).toBe(403)
    expect(due.body).toEqual({ error: 'password_due' })
    expect(
      (await call('GET', '/api/me', undefined, { now: at(14 * DAY) })).body.vault.passkeys,
    ).toEqual({
      state: 'password_due',
    })
    // パスキーで開いても延びない。マスターパスワードで開くと延びる
    await call('POST', '/api/unlock', { authToken: vault.authToken }, { now: at(14 * DAY) })
    expect((await call('POST', '/api/unlock/passkey', body, { now: at(27 * DAY) })).status).toBe(
      200,
    )
    const row = await db.db
      .prepare('SELECT failed_count FROM users')
      .first<{ failed_count: number }>()
    expect(row?.failed_count).toBe(0)
  })

  it('記録の無い利用者(前からいる人)は、まずマスターパスワードで開く', async () => {
    const { pk } = await registered()
    await db.db.prepare('UPDATE users SET password_unlocked_at = NULL').run()
    expect((await call('GET', '/api/me')).body.vault.passkeys).toEqual({ state: 'password_due' })
    const res = await call('POST', '/api/unlock/passkey', {
      credentialId: pk.credentialId,
      authToken: pk.authToken,
    })
    expect(res.body).toEqual({ error: 'password_due' })
  })

  it('ほかの人のパスキーでは開けない', async () => {
    const { pk } = await registered()
    await setup(OTHER)
    const res = await call(
      'POST',
      '/api/unlock/passkey',
      { credentialId: pk.credentialId, authToken: pk.authToken },
      OTHER,
    )
    expect(res.status).toBe(403)
  })
})
