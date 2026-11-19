// 金庫を作る・開ける・閉じる・回復(Dev Spec 5 章・8 章)。
// サーバーは合言葉を HMAC して比べるだけで、金庫の鍵もデータも読めない
import {
  AUTH_BYTES,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  MAX_SETTINGS_BYTES,
  MIN_SEALED_BYTES,
  SALT_BYTES,
  WRAPPED_KEY_BYTES,
} from '../src/shared/api-types.ts'
import { toBase64 } from '../src/shared/base64.ts'
import { parseKdfParams, type KdfParams } from '../src/shared/kdf-params.ts'
import type { AppEnv } from './env.ts'
import { blobBytes, bytesField, error, HttpError, json, readJson, type D1Blob } from './http.ts'
import { createSession, deleteSession, requireSession } from './session.ts'

export interface Ctx {
  request: Request
  env: AppEnv
  db: D1Database
  userId: string
  now: Date
  /** パスの中の値(/api/entries/:id の id) */
  params: Record<string, string>
}

export function authPepper(env: AppEnv): string {
  if (!env.AUTH_PEPPER) throw new HttpError(500, 'server_misconfigured')
  return env.AUTH_PEPPER
}

async function hmacKey(pepper: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** D1 に置く値 = HMAC(AUTH_PEPPER, 合言葉) */
export async function authHash(
  pepper: string,
  token: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(pepper), token))
}

/** 置いた値と比べる。比べる時間が中身で変わらないよう、Web Crypto の verify を使う(Dev Spec 5.2) */
export async function authMatches(
  pepper: string,
  stored: D1Blob,
  token: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  return crypto.subtle.verify('HMAC', await hmacKey(pepper), blobBytes(stored), token)
}

export function kdfField(body: Record<string, unknown>): KdfParams {
  try {
    return parseKdfParams(body['kdfParams'])
  } catch {
    throw new HttpError(400, 'bad_request')
  }
}

/** POST /api/vault: 金庫を作る(すでにあれば 409) */
export async function createVault({ request, env, db, userId, now }: Ctx): Promise<Response> {
  const pepper = authPepper(env)
  const body = await readJson(request)
  const kdf = kdfField(body)
  const salt = bytesField(body, 'salt', SALT_BYTES)
  const auth = bytesField(body, 'authToken', AUTH_BYTES)
  const wrapped = bytesField(body, 'wrappedKey', WRAPPED_KEY_BYTES)
  const rSalt = bytesField(body, 'recoverySalt', SALT_BYTES)
  const rAuth = bytesField(body, 'recoveryAuthToken', AUTH_BYTES)
  const rWrapped = bytesField(body, 'recoveryWrappedKey', WRAPPED_KEY_BYTES)
  const settings = bytesField(body, 'settings', { min: MIN_SEALED_BYTES, max: MAX_SETTINGS_BYTES })

  const t = now.getTime()
  const inserted = await db
    .prepare(
      `INSERT INTO users (id, kdf_params, salt, auth_hash, wrapped_key, recovery_salt, recovery_auth_hash,
         recovery_wrapped_key, settings_ct, created_at, updated_at, password_unlocked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(
      userId,
      JSON.stringify(kdf),
      salt,
      await authHash(pepper, auth),
      wrapped,
      rSalt,
      await authHash(pepper, rAuth),
      rWrapped,
      settings,
      t,
      t,
      t,
    )
    .run()
  if (inserted.meta.changes !== 1) return error(409, 'vault_exists')
  return json({ token: await createSession(db, userId, 'vault', now) }, 201)
}

type Attempt = { ok: true; count: number } | { ok: false; lockedUntil: number }

/**
 * 1 回の試みを数える。比べる前に数を足すので、同時にたくさん送られても、
 * 待たせるまでに比べられるのは MAX_FAILED_ATTEMPTS 回まで。待たせている間は数えずに断る
 */
export async function reserveAttempt(db: D1Database, userId: string, now: Date): Promise<Attempt> {
  const t = now.getTime()
  const row = await db
    .prepare(
      `UPDATE users SET failed_count = failed_count + 1
       WHERE id = ? AND (locked_until IS NULL OR locked_until <= ?)
       RETURNING failed_count`,
    )
    .bind(userId, t)
    .first<{ failed_count: number }>()
  if (!row) {
    const locked = await db
      .prepare('SELECT locked_until FROM users WHERE id = ?')
      .bind(userId)
      .first<{ locked_until: number | null }>()
    return { ok: false, lockedUntil: locked?.locked_until ?? t + LOCKOUT_MS }
  }
  if (row.failed_count > MAX_FAILED_ATTEMPTS)
    return { ok: false, lockedUntil: await lockOut(db, userId, now) }
  return { ok: true, count: row.failed_count }
}

/** 待たせる。回数は 0 に戻す(Dev Spec 5.2)。返す値は待たせる終わりの時刻 */
export async function lockOut(db: D1Database, userId: string, now: Date): Promise<number> {
  const t = now.getTime()
  const row = await db
    .prepare(
      `UPDATE users SET failed_count = 0,
         locked_until = CASE WHEN locked_until IS NULL OR locked_until <= ?1 THEN ?2 ELSE locked_until END
       WHERE id = ?3 RETURNING locked_until`,
    )
    .bind(t, t + LOCKOUT_MS, userId)
    .first<{ locked_until: number }>()
  return row?.locked_until ?? t + LOCKOUT_MS
}

export async function resetAttempts(db: D1Database, userId: string) {
  await db.prepare('UPDATE users SET failed_count = 0 WHERE id = ?').bind(userId).run()
}

export interface SecretRow {
  auth_hash: D1Blob
  wrapped_key: D1Blob
  recovery_auth_hash: D1Blob
  recovery_wrapped_key: D1Blob
  settings_ct: D1Blob
  settings_version: number
}

/**
 * 合言葉(または回復の合言葉)を確かめる。マスターパスワードと回復キーで、失敗の回数を共有する(Dev Spec 5.3)。
 * 合わなければ、エラーの応答を返す
 */
async function checkSecret(
  ctx: Ctx,
  field: 'authToken' | 'recoveryAuthToken',
): Promise<{ row: SecretRow } | { response: Response }> {
  const token = bytesField(await readJson(ctx.request), field, AUTH_BYTES)
  return verifySecret(ctx, token, field === 'authToken' ? 'password' : 'recovery')
}

/**
 * 受け取った合言葉を、置いた値と比べる。失敗の回数を数え、10 回で待たせる(Dev Spec 5.2)。
 * 今の合言葉を求める操作(マスターパスワードの変更など。Dev Spec 8 章)もここを通る
 */
export async function verifySecret(
  ctx: Ctx,
  token: Uint8Array<ArrayBuffer>,
  which: 'password' | 'recovery',
): Promise<{ row: SecretRow } | { response: Response }> {
  const { env, db, userId, now } = ctx
  const pepper = authPepper(env)
  const row = await db
    .prepare(
      `SELECT auth_hash, wrapped_key, recovery_auth_hash, recovery_wrapped_key, settings_ct, settings_version
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<SecretRow>()
  if (!row) return { response: error(404, 'no_vault') }

  const attempt = await reserveAttempt(db, userId, now)
  if (!attempt.ok) return { response: error(429, 'locked', { lockedUntil: attempt.lockedUntil }) }

  const stored = which === 'password' ? row.auth_hash : row.recovery_auth_hash
  if (await authMatches(pepper, stored, token)) {
    await resetAttempts(db, userId)
    return { row }
  }
  if (attempt.count >= MAX_FAILED_ATTEMPTS) {
    return { response: error(429, 'locked', { lockedUntil: await lockOut(db, userId, now) }) }
  }
  return { response: error(403, 'wrong_secret') }
}

/** POST /api/unlock: 合言葉を確かめ、トークン・包んだ金庫の鍵・設定を返す */
export async function unlock(ctx: Ctx): Promise<Response> {
  const result = await checkSecret(ctx, 'authToken')
  if ('response' in result) return result.response
  const { row } = result
  await ctx.db
    .prepare('UPDATE users SET password_unlocked_at = ? WHERE id = ?')
    .bind(ctx.now.getTime(), ctx.userId)
    .run()
  return json({
    token: await createSession(ctx.db, ctx.userId, 'vault', ctx.now),
    wrappedKey: toBase64(blobBytes(row.wrapped_key)),
    settings: toBase64(blobBytes(row.settings_ct)),
    settingsVersion: row.settings_version,
  })
}

/** POST /api/recover: 回復の合言葉を確かめ、回復のためだけのトークン(10 分)と、回復で包んだ金庫の鍵を返す */
export async function recover(ctx: Ctx): Promise<Response> {
  const result = await checkSecret(ctx, 'recoveryAuthToken')
  if ('response' in result) return result.response
  return json({
    token: await createSession(ctx.db, ctx.userId, 'recover', ctx.now),
    recoveryWrappedKey: toBase64(blobBytes(result.row.recovery_wrapped_key)),
  })
}

/**
 * POST /api/recover/complete: 新しいマスターパスワードの値で置き換える。
 * ほかの端末のセッションをすべて切り、新しい金庫のセッションを返す。回復キーはそのまま使える(Dev Spec 5.3)
 */
export async function recoverComplete(ctx: Ctx): Promise<Response> {
  const { request, env, db, userId, now } = ctx
  const pepper = authPepper(env)
  await requireSession(request, db, userId, ['recover'], now)
  const body = await readJson(request)
  const kdf = kdfField(body)
  const salt = bytesField(body, 'salt', SALT_BYTES)
  const auth = bytesField(body, 'authToken', AUTH_BYTES)
  const wrapped = bytesField(body, 'wrappedKey', WRAPPED_KEY_BYTES)

  const t = now.getTime()
  const results = await db.batch([
    db
      .prepare(
        `UPDATE users SET kdf_params = ?, salt = ?, auth_hash = ?, wrapped_key = ?,
           failed_count = 0, locked_until = NULL, updated_at = ?, password_unlocked_at = ?
         WHERE id = ? RETURNING settings_ct, settings_version`,
      )
      .bind(JSON.stringify(kdf), salt, await authHash(pepper, auth), wrapped, t, t, userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
  ])
  const row = results[0]?.results[0] as
    { settings_ct: D1Blob; settings_version: number } | undefined
  if (!row) return error(404, 'no_vault')
  return json({
    token: await createSession(db, userId, 'vault', now),
    settings: toBase64(blobBytes(row.settings_ct)),
    settingsVersion: row.settings_version,
  })
}

/** POST /api/lock: トークンを切る(金庫のものも、回復のものも) */
export async function lock({ request, db, userId, now }: Ctx): Promise<Response> {
  await deleteSession(db, await requireSession(request, db, userId, ['vault', 'recover'], now))
  return json({ ok: true })
}
