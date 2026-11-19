// 利用者の確かめ方(Dev Spec 4 章)と、振り分けのテスト
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { verifyAccessToken } from './access.ts'
import wranglerConfig from '../wrangler.jsonc?raw'
import { userIdFor } from './identity.ts'
import { caller, startDb, TEST_PEPPERS } from './testing.ts'

const TEAM = 'team.cloudflareaccess.com'
const AUD = 'aud-value'
const HOST = 'account-manager-demo.example.workers.dev'

let keys: JWTVerifyGetKey
let sign: (claims?: {
  aud?: string
  iss?: string
  exp?: number
  email?: string | null
}) => Promise<string>
let signWithOtherKey: () => Promise<string>
let db: Awaited<ReturnType<typeof startDb>>

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  const other = await generateKeyPair('RS256')
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }],
  })
  sign = (c = {}) =>
    new SignJWT(c.email === null ? {} : { email: c.email ?? 'Owner@Example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(c.iss ?? `https://${TEAM}`)
      .setAudience(c.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(c.exp ?? Math.floor(Date.now() / 1000) + 600)
      .sign(pair.privateKey)
  signWithOtherKey = () =>
    new SignJWT({ email: 'owner@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setExpirationTime('10m')
      .sign(other.privateKey)
  db = await startDb()
})

afterAll(() => db.dispose())
beforeEach(() => db.reset())

describe('verifyAccessToken', () => {
  const verify = (token: string | null) =>
    verifyAccessToken(token, { teamDomain: TEAM, audience: AUD, keys })

  it('正しい証明書なら、小文字にそろえたメールアドレスを返す', async () => {
    expect(await verify(await sign())).toBe('owner@example.com')
  })

  it('証明書が無い・壊れている・メールアドレスが無いなら null', async () => {
    expect(await verify(null)).toBeNull()
    expect(await verify('not-a-jwt')).toBeNull()
    expect(await verify(await sign({ email: null }))).toBeNull()
  })

  it('別のアプリ・別のチーム・期限切れ・別の鍵なら null', async () => {
    expect(await verify(await sign({ aud: 'other-app' }))).toBeNull()
    expect(await verify(await sign({ iss: 'https://other.cloudflareaccess.com' }))).toBeNull()
    expect(await verify(await sign({ exp: Math.floor(Date.now() / 1000) - 60 }))).toBeNull()
    expect(await verify(await signWithOtherKey())).toBeNull()
  })
})

describe('利用者の見分け方', () => {
  const accessEnv = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }

  it('Access の証明書のメールアドレスから利用者の ID を作る(メールアドレスそのものは返さない)', async () => {
    const call = caller(db.db)
    const res = await call('GET', '/api/me', undefined, {
      host: HOST,
      noDevDefaults: true,
      env: accessEnv,
      deps: { keys },
      headers: { 'Cf-Access-Jwt-Assertion': await sign() },
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      userId: await userIdFor('owner@example.com', TEST_PEPPERS.USER_ID_PEPPER),
      vault: null,
    })
    expect(JSON.stringify(res.body)).not.toContain('example.com')
  })

  it('利用者の ID は、大文字・小文字の違うメールアドレスでも同じで、鍵が違えば変わる', async () => {
    const a = await userIdFor('Owner@Example.com', 'k1')
    expect(a).toBe(await userIdFor('owner@example.com', 'k1'))
    expect(a).not.toBe(await userIdFor('owner@example.com', 'k2'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('証明書が無い・正しくなければ 401', async () => {
    const call = caller(db.db)
    const base = { host: HOST, noDevDefaults: true, env: accessEnv, deps: { keys } }
    expect((await call('GET', '/api/me', undefined, base)).status).toBe(401)
    const other = await signWithOtherKey()
    expect(
      (
        await call('GET', '/api/me', undefined, {
          ...base,
          headers: { 'Cf-Access-Jwt-Assertion': other },
        })
      ).status,
    ).toBe(401)
  })

  it('Access の設定が欠けていたら、証明書があっても 401(守りの側に倒す)', async () => {
    const call = caller(db.db)
    const res = await call('GET', '/api/me', undefined, {
      host: HOST,
      noDevDefaults: true,
      env: { ACCESS_TEAM_DOMAIN: TEAM },
      deps: { keys },
      headers: { 'Cf-Access-Jwt-Assertion': await sign() },
    })
    expect(res.status).toBe(401)
  })

  it('USER_ID_PEPPER が無ければ 500(利用者の ID を作らない)', async () => {
    const call = caller(db.db)
    const res = await call('GET', '/api/me', undefined, { env: { USER_ID_PEPPER: undefined } })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'server_misconfigured' })
  })
})

describe('手元の開発の抜け道(Dev Spec 4.2)', () => {
  it('ENVIRONMENT=development で localhost なら、DEV_ACCESS_EMAIL を利用者として扱う', async () => {
    const call = caller(db.db)
    for (const host of ['localhost', '127.0.0.1', 'localhost:5173']) {
      const res = await call('GET', '/api/me', undefined, { host })
      expect(res.status).toBe(200)
      expect(res.body.userId).toBe(await userIdFor('dev@example.com', TEST_PEPPERS.USER_ID_PEPPER))
    }
  })

  it('本番のホストでは、ENVIRONMENT=development でも効かない', async () => {
    const call = caller(db.db)
    expect((await call('GET', '/api/me', undefined, { host: HOST })).status).toBe(401)
    expect(
      (await call('GET', '/api/me', undefined, { host: 'localhost.example.workers.dev' })).status,
    ).toBe(401)
  })

  it('ENVIRONMENT が development でなければ、localhost でも効かない', async () => {
    const call = caller(db.db)
    for (const ENVIRONMENT of [undefined, 'production', 'Development']) {
      expect((await call('GET', '/api/me', undefined, { env: { ENVIRONMENT } })).status).toBe(401)
    }
  })

  it('本番の設定(wrangler.jsonc)に ENVIRONMENT と DEV_ACCESS_EMAIL が書かれていない', () => {
    const withoutComments = wranglerConfig
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(withoutComments).not.toContain('ENVIRONMENT')
    expect(withoutComments).not.toContain('DEV_ACCESS_EMAIL')
    expect(withoutComments).not.toMatch(/"vars"/)
  })
})

describe('振り分け', () => {
  it('利用者が分からなければ、知らないパスでも先に 401', async () => {
    const call = caller(db.db)
    expect((await call('GET', '/api/nope', undefined, { noDevDefaults: true })).status).toBe(401)
  })

  it('知らないパスは 404、メソッドが違えば 405', async () => {
    const call = caller(db.db)
    expect((await call('GET', '/api/nope')).status).toBe(404)
    expect((await call('DELETE', '/api/me')).status).toBe(405)
  })

  it('/api/health は D1 につながっていれば ok', async () => {
    const call = caller(db.db)
    const res = await call('GET', '/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('金庫があれば、/api/me は kdf_params・salt・待たせている時刻を返す', async () => {
    const call = caller(db.db)
    const userId = await userIdFor('dev@example.com', TEST_PEPPERS.USER_ID_PEPPER)
    const blob = new Uint8Array([1, 2, 3])
    await db.db
      .prepare(
        `INSERT INTO users (id, kdf_params, salt, auth_hash, wrapped_key, recovery_salt,
          recovery_auth_hash, recovery_wrapped_key, settings_ct, locked_until, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      )
      .bind(
        userId,
        '{"alg":"argon2id","m":65536,"t":3,"p":1}',
        new Uint8Array([9, 9]),
        blob,
        blob,
        new Uint8Array([8]),
        blob,
        blob,
        blob,
        Date.parse('2026-11-15T04:00:00Z'),
      )
      .run()
    const res = await call('GET', '/api/me')
    expect(res.body).toEqual({
      userId,
      vault: {
        kdfParams: { alg: 'argon2id', m: 65536, t: 3, p: 1 },
        salt: 'CQk=',
        recoverySalt: 'CA==',
        lockedUntil: Date.parse('2026-11-15T04:00:00Z'),
        passkeys: { state: 'none' },
      },
    })
    // 待たせる時刻を過ぎていれば null
    const later = await call('GET', '/api/me', undefined, { now: new Date('2026-11-15T05:00:00Z') })
    expect(later.body.vault.lockedUntil).toBeNull()
  })
})
