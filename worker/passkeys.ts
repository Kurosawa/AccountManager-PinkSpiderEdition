// パスキーの登録・一覧・削除(フェーズ 2 の 4。Dev Spec 17 章・discussion38)。
// サーバーはパスキーの署名を確かめない。PRF の値から作った合言葉の HMAC と、包んだ金庫の鍵だけを置く
import {
  AUTH_BYTES,
  GCM_TAG_BYTES,
  IV_BYTES,
  CREDENTIAL_ID_PATTERN,
  MAX_FAILED_ATTEMPTS,
  PASSWORD_INTERVAL_MS,
  type PasskeyUnlockInfo,
  type PasskeyUnlockResponse,
  MAX_PASSKEY_NAME_CT_BYTES,
  MAX_PASSKEYS,
  PRF_SALT_BYTES,
  WRAPPED_KEY_BYTES,
  type ListPasskeysResponse,
} from '../src/shared/api-types.ts'
import { toBase64 } from '../src/shared/base64.ts'
import { blobBytes, bytesField, error, HttpError, json, readJson, type D1Blob } from './http.ts'
import { insertFailure } from './limits.ts'
import { createSession, requireSession } from './session.ts'
import { requireCurrentSecret } from './settings.ts'
import {
  authHash,
  authMatches,
  authPepper,
  lockOut,
  reserveAttempt,
  resetAttempts,
  type Ctx,
} from './vault.ts'

function credentialIdOf(value: unknown): string {
  if (typeof value !== 'string' || !CREDENTIAL_ID_PATTERN.test(value)) {
    throw new HttpError(400, 'bad_request')
  }
  return value
}

/**
 * 暗号にした名前(discussion47 の 1)。サーバーは中身を読めないので、大きさだけを確かめる
 * (IV 12 + タグ 16 + 最も短い JSON の 3 バイト以上)
 */
function nameCiphertextOf(body: Record<string, unknown>): Uint8Array<ArrayBuffer> {
  return bytesField(body, 'nameCiphertext', {
    min: IV_BYTES + GCM_TAG_BYTES + 3,
    max: MAX_PASSKEY_NAME_CT_BYTES,
  })
}

/** GET /api/passkeys: 登録したパスキーの一覧(暗号にした名前と登録した日だけ) */
export async function listPasskeys({ request, db, userId, now }: Ctx): Promise<Response> {
  await requireSession(request, db, userId, ['vault'], now)
  const { results } = await db
    .prepare(
      'SELECT id, name, name_ct, created_at FROM passkeys WHERE user_id = ? ORDER BY created_at',
    )
    .bind(userId)
    .all<{ id: string; name: string; name_ct: D1Blob | null; created_at: number }>()
  return json({
    passkeys: results.map((r) => ({
      id: r.id,
      nameCiphertext: r.name_ct === null ? null : toBase64(blobBytes(r.name_ct)),
      legacyName: r.name_ct === null ? r.name : null,
      createdAt: r.created_at,
    })),
  } satisfies ListPasskeysResponse)
}

/** PUT /api/passkeys/:id/name: 前の版の暗号でない名前を、暗号にして置き直す。無ければ 404 */
export async function renamePasskey(ctx: Ctx): Promise<Response> {
  const { request, db, userId, now, params } = ctx
  await requireSession(request, db, userId, ['vault'], now)
  const id = credentialIdOf(params['id'])
  const nameCt = nameCiphertextOf(await readJson(request))
  const res = await db
    .prepare("UPDATE passkeys SET name = '', name_ct = ? WHERE id = ? AND user_id = ?")
    .bind(nameCt, id, userId)
    .run()
  if (res.meta.changes !== 1) return error(404, 'not_found')
  return json({ ok: true })
}

/**
 * POST /api/passkeys: パスキーを登録する。今のマスターパスワードを求める(discussion38)。
 * 5 つまで(limit_reached)。同じ credential ID があれば passkey_exists
 */
export async function addPasskey(ctx: Ctx): Promise<Response> {
  const checked = await requireCurrentSecret(ctx)
  if (checked instanceof Response) return checked
  const { body } = checked
  const id = credentialIdOf(body['credentialId'])
  const nameCt = nameCiphertextOf(body)
  const prfSalt = bytesField(body, 'prfSalt', PRF_SALT_BYTES)
  const auth = bytesField(body, 'authToken', AUTH_BYTES)
  const wrapped = bytesField(body, 'wrappedKey', WRAPPED_KEY_BYTES)
  const { db, userId, now, env } = ctx
  // 数の確かめと足すことを 1 つの SQL で行う(同時に足されても 5 つを超えない)
  const inserted = await db
    .prepare(
      `INSERT INTO passkeys (id, user_id, name, name_ct, prf_salt, auth_hash, wrapped_key, created_at)
       SELECT ?1, ?2, '', ?3, ?4, ?5, ?6, ?7
       WHERE (SELECT COUNT(*) FROM passkeys WHERE user_id = ?2) < ?8
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(
      id,
      userId,
      nameCt,
      prfSalt,
      await authHash(authPepper(env), auth),
      wrapped,
      now.getTime(),
      MAX_PASSKEYS,
    )
    .run()
  if (inserted.meta.changes === 1) return json({ ok: true }, 201)
  return error(409, await insertFailure(db, 'passkeys', userId, MAX_PASSKEYS, 'passkey_exists'))
}

/** DELETE /api/passkeys/:id: 自分のパスキーの登録を消す。無ければ 404 */
export async function deletePasskey({ request, db, userId, now, params }: Ctx): Promise<Response> {
  await requireSession(request, db, userId, ['vault'], now)
  const id = credentialIdOf(params['id'])
  const res = await db
    .prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run()
  if (res.meta.changes !== 1) return error(404, 'not_found')
  return json({ ok: true })
}

/** /api/me に入れる、パスキーで開けるか(2 週間のきまりはサーバーで決める。discussion38 の 3) */
export async function passkeyUnlockInfo(
  db: D1Database,
  userId: string,
  passwordUnlockedAt: number | null,
  now: Date,
): Promise<PasskeyUnlockInfo> {
  const { results } = await db
    .prepare('SELECT id, prf_salt FROM passkeys WHERE user_id = ? ORDER BY created_at')
    .bind(userId)
    .all<{ id: string; prf_salt: D1Blob }>()
  if (results.length === 0) return { state: 'none' }
  if (passwordUnlockedAt === null || now.getTime() - passwordUnlockedAt >= PASSWORD_INTERVAL_MS) {
    return { state: 'password_due' }
  }
  return {
    state: 'available',
    credentials: results.map((r) => ({ id: r.id, prfSalt: toBase64(blobBytes(r.prf_salt)) })),
  }
}

/**
 * POST /api/unlock/passkey: パスキーの合言葉を確かめ、トークン・包んだ金庫の鍵・設定を返す。
 * 失敗の回数はマスターパスワードと合わせて数える(discussion38)。知らない ID も失敗に数える。
 * 最後にマスターパスワードで開いてから 2 週間たっていれば、比べずに 403 password_due
 */
export async function unlockWithPasskey(ctx: Ctx): Promise<Response> {
  const { request, env, db, userId, now } = ctx
  const pepper = authPepper(env)
  const body = await readJson(request)
  const id = credentialIdOf(body['credentialId'])
  const token = bytesField(body, 'authToken', AUTH_BYTES)
  const user = await db
    .prepare(
      'SELECT wrapped_key, settings_ct, settings_version, password_unlocked_at FROM users WHERE id = ?',
    )
    .bind(userId)
    .first<{
      wrapped_key: D1Blob
      settings_ct: D1Blob
      settings_version: number
      password_unlocked_at: number | null
    }>()
  if (!user) return error(404, 'no_vault')
  const due =
    user.password_unlocked_at === null ||
    now.getTime() - user.password_unlocked_at >= PASSWORD_INTERVAL_MS
  if (due) return error(403, 'password_due')

  const attempt = await reserveAttempt(db, userId, now)
  if (!attempt.ok) return error(429, 'locked', { lockedUntil: attempt.lockedUntil })
  const pk = await db
    .prepare('SELECT auth_hash, wrapped_key FROM passkeys WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ auth_hash: D1Blob; wrapped_key: D1Blob }>()
  if (pk && (await authMatches(pepper, pk.auth_hash, token))) {
    await resetAttempts(db, userId)
    return json({
      token: await createSession(db, userId, 'vault', now),
      wrappedKey: toBase64(blobBytes(user.wrapped_key)),
      passkeyWrappedKey: toBase64(blobBytes(pk.wrapped_key)),
      settings: toBase64(blobBytes(user.settings_ct)),
      settingsVersion: user.settings_version,
    } satisfies PasskeyUnlockResponse)
  }
  if (attempt.count >= MAX_FAILED_ATTEMPTS) {
    return error(429, 'locked', { lockedUntil: await lockOut(db, userId, now) })
  }
  return error(403, 'wrong_secret')
}
