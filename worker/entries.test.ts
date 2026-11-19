// 1 件の読み書きの API のテスト(Dev Spec 10 章のステップ 4: 409 のテスト)。手元の D1 を使う
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MAX_ENTRIES } from '../src/shared/api-types.ts'
import { DEFAULT_KDF_PARAMS } from '../src/shared/kdf-params.ts'
import { caller, randomBase64, startDb, type CallOptions } from './testing.ts'

let db: Awaited<ReturnType<typeof startDb>>
let call: ReturnType<typeof caller>

beforeAll(async () => {
  db = await startDb()
  call = caller(db.db)
})
afterAll(() => db.dispose())
beforeEach(() => db.reset())

const rand = randomBase64
const OTHER: CallOptions = { env: { DEV_ACCESS_EMAIL: 'other@example.com' } }

/** 金庫を作り、トークンを付けて呼ぶ関数を返す */
async function signedIn(o: CallOptions = {}) {
  const res = await call(
    'POST',
    '/api/vault',
    {
      kdfParams: DEFAULT_KDF_PARAMS,
      salt: rand(16),
      authToken: rand(32),
      wrappedKey: rand(60),
      recoverySalt: rand(16),
      recoveryAuthToken: rand(32),
      recoveryWrappedKey: rand(60),
      settings: rand(40),
    },
    o,
  )
  expect(res.status).toBe(201)
  const token = res.body.token as string
  return (method: string, path: string, body?: unknown) =>
    call(method, path, body, { ...o, headers: { Authorization: `Bearer ${token}` } })
}

const newId = () => crypto.randomUUID()

describe('1 件の読み書き', () => {
  it('足す → 一覧 → 直す → 消す', async () => {
    const api = await signedIn()
    const id = newId()
    const ct1 = rand(100)
    expect((await api('POST', '/api/entries', { id, ciphertext: ct1 })).status).toBe(201)
    expect((await api('GET', '/api/entries')).body).toEqual({
      entries: [{ id, version: 1, ciphertext: ct1 }],
    })

    const ct2 = rand(120)
    const put = await api('PUT', `/api/entries/${id}`, { expectedVersion: 1, ciphertext: ct2 })
    expect(put.status).toBe(200)
    expect(put.body).toEqual({ version: 2 })
    expect((await api('GET', '/api/entries')).body.entries).toEqual([
      { id, version: 2, ciphertext: ct2 },
    ])

    expect((await api('DELETE', `/api/entries/${id}`, { expectedVersion: 2 })).status).toBe(200)
    expect((await api('GET', '/api/entries')).body.entries).toEqual([])
  })

  it('版が違えば、直す・消すは 409 で、中身は変わらない(ほかの端末で更新されたとき)', async () => {
    const api = await signedIn()
    const id = newId()
    const ct = rand(100)
    await api('POST', '/api/entries', { id, ciphertext: ct })
    await api('PUT', `/api/entries/${id}`, { expectedVersion: 1, ciphertext: rand(100) })

    // 別の端末は、まだ版 1 だと思っている
    const stale = await api('PUT', `/api/entries/${id}`, { expectedVersion: 1, ciphertext: ct })
    expect(stale.status).toBe(409)
    expect(stale.body).toEqual({ error: 'version_conflict' })
    const del = await api('DELETE', `/api/entries/${id}`, { expectedVersion: 1 })
    expect(del.status).toBe(409)
    const [row] = (await api('GET', '/api/entries')).body.entries
    expect(row.version).toBe(2)
    expect(row.ciphertext).not.toBe(ct)
  })

  it('同時に同じ版から直しても、通るのは 1 つだけ', async () => {
    const api = await signedIn()
    const id = newId()
    await api('POST', '/api/entries', { id, ciphertext: rand(100) })
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api('PUT', `/api/entries/${id}`, { expectedVersion: 1, ciphertext: rand(100) }),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409])
  })

  it('同じ ID を 2 回足すと 409', async () => {
    const api = await signedIn()
    const id = newId()
    await api('POST', '/api/entries', { id, ciphertext: rand(100) })
    const again = await api('POST', '/api/entries', { id, ciphertext: rand(100) })
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ error: 'entry_exists' })
  })

  it('ほかの人と ID が重なっても、上限に届いていなければ entry_exists で、ほかの人の件は変わらない', async () => {
    const mine = await signedIn()
    const theirs = await signedIn(OTHER)
    const id = newId()
    const ct = rand(100)
    await theirs('POST', '/api/entries', { id, ciphertext: ct })
    const res = await mine('POST', '/api/entries', { id, ciphertext: rand(100) })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'entry_exists' })
    expect((await mine('GET', '/api/entries')).body.entries).toEqual([])
    expect((await theirs('GET', '/api/entries')).body.entries).toEqual([
      { id, version: 1, ciphertext: ct },
    ])
  })

  it('無い件を直す・消すと 404', async () => {
    const api = await signedIn()
    const id = newId()
    expect(
      (await api('PUT', `/api/entries/${id}`, { expectedVersion: 1, ciphertext: rand(100) }))
        .status,
    ).toBe(404)
    expect((await api('DELETE', `/api/entries/${id}`, { expectedVersion: 1 })).status).toBe(404)
    expect((await api('DELETE', '/api/entries/not-a-uuid', { expectedVersion: 1 })).status).toBe(
      404,
    )
  })

  it('形の違う本文は 400', async () => {
    const api = await signedIn()
    const id = newId()
    const cases: Array<[string, string, unknown]> = [
      ['POST', '/api/entries', { id: 'abc', ciphertext: rand(100) }],
      ['POST', '/api/entries', { id: id.toUpperCase(), ciphertext: rand(100) }],
      ['POST', '/api/entries', { id, ciphertext: rand(10) }],
      ['POST', '/api/entries', { id, ciphertext: rand(64 * 1024 + 1) }],
      ['POST', '/api/entries', { id }],
    ]
    for (const [m, p, b] of cases) {
      expect({ b: JSON.stringify(b).slice(0, 60), s: (await api(m, p, b)).status }).toEqual({
        b: JSON.stringify(b).slice(0, 60),
        s: 400,
      })
    }
    await api('POST', '/api/entries', { id, ciphertext: rand(100) })
    for (const v of [0, -1, 1.5, '1', null]) {
      const res = await api('PUT', `/api/entries/${id}`, {
        expectedVersion: v,
        ciphertext: rand(100),
      })
      expect(res.status).toBe(400)
    }
  })

  it(`1 人 ${MAX_ENTRIES} 件まで`, async () => {
    const api = await signedIn()
    const userId = (await call('GET', '/api/me')).body.userId as string
    // 上限の手前まで、D1 に直接入れる
    const stmt = db.db.prepare(
      'INSERT INTO entries (id, user_id, version, ciphertext, updated_at) VALUES (?, ?, 1, ?, 0)',
    )
    const rows = Array.from({ length: MAX_ENTRIES - 1 }, () =>
      stmt.bind(newId(), userId, new Uint8Array(32)),
    )
    for (let i = 0; i < rows.length; i += 500) await db.db.batch(rows.slice(i, i + 500))
    expect((await api('POST', '/api/entries', { id: newId(), ciphertext: rand(100) })).status).toBe(
      201,
    )
    const over = await api('POST', '/api/entries', { id: newId(), ciphertext: rand(100) })
    expect(over.status).toBe(409)
    expect(over.body).toEqual({ error: 'limit_reached' })
  })
})

describe('ほかの利用者とセッション', () => {
  it('ほかの利用者の件は、見えず・直せず・消せない', async () => {
    const mine = await signedIn()
    const theirs = await signedIn(OTHER)
    const id = newId()
    await theirs('POST', '/api/entries', { id, ciphertext: rand(100) })

    expect((await mine('GET', '/api/entries')).body.entries).toEqual([])
    expect(
      (await mine('PUT', `/api/entries/${id}`, { expectedVersion: 1, ciphertext: rand(100) }))
        .status,
    ).toBe(404)
    expect((await mine('DELETE', `/api/entries/${id}`, { expectedVersion: 1 })).status).toBe(404)
    // 同じ ID で足そうとしても、ほかの人の件は上書きされない
    expect((await mine('POST', '/api/entries', { id, ciphertext: rand(100) })).status).toBe(409)
    expect((await theirs('GET', '/api/entries')).body.entries).toHaveLength(1)
  })

  it('トークンが無いと 401', async () => {
    await signedIn()
    expect((await call('GET', '/api/entries')).status).toBe(401)
    expect(
      (await call('POST', '/api/entries', { id: newId(), ciphertext: rand(100) })).body,
    ).toEqual({ error: 'invalid_session' })
  })

  it('回復のトークンでは読み書きできない', async () => {
    const res = await call('POST', '/api/vault', {
      kdfParams: DEFAULT_KDF_PARAMS,
      salt: rand(16),
      authToken: rand(32),
      wrappedKey: rand(60),
      recoverySalt: rand(16),
      recoveryAuthToken: 'A'.repeat(43) + '=',
      recoveryWrappedKey: rand(60),
      settings: rand(40),
    })
    expect(res.status).toBe(201)
    const rec = await call('POST', '/api/recover', { recoveryAuthToken: 'A'.repeat(43) + '=' })
    expect(rec.status).toBe(200)
    const get = await call('GET', '/api/entries', undefined, {
      headers: { Authorization: `Bearer ${rec.body.token}` },
    })
    expect(get.status).toBe(401)
  })
})
