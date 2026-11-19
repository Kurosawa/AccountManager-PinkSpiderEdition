// 設定の画面で使う操作(PRD 5.2・Dev Spec 8 章)。
// 設定を直す以外は、今のマスターパスワード(の合言葉)を求め、失敗の回数に数える
import {
  AUTH_BYTES,
  MAX_SETTINGS_BYTES,
  MIN_SEALED_BYTES,
  SALT_BYTES,
  WRAPPED_KEY_BYTES,
} from '../src/shared/api-types.ts'
import { toBase64 } from '../src/shared/base64.ts'
import { blobBytes, bytesField, error, HttpError, json, readJson, type D1Blob } from './http.ts'
import { requireSession } from './session.ts'
import { authHash, authPepper, kdfField, verifySecret, type Ctx } from './vault.ts'

/**
 * トークンと今の合言葉を確かめ、本文を返す。合言葉は、ほかの項目より先に確かめる
 * (画面は、今のマスターパスワードが違うと分かっているときも、合言葉だけを送って回数に数えさせる)
 */
export async function requireCurrentSecret(
  ctx: Ctx,
): Promise<{ body: Record<string, unknown>; tokenHash: Uint8Array<ArrayBuffer> } | Response> {
  const tokenHash = await requireSession(ctx.request, ctx.db, ctx.userId, ['vault'], ctx.now)
  const body = await readJson(ctx.request)
  const current = bytesField(body, 'currentAuthToken', AUTH_BYTES)
  const result = await verifySecret(ctx, current, 'password')
  if ('response' in result) return result.response
  return { body, tokenHash }
}

/** PUT /api/settings: 設定を直す。版が違えば 409 */
export async function updateSettings({ request, db, userId, now }: Ctx): Promise<Response> {
  await requireSession(request, db, userId, ['vault'], now)
  const body = await readJson(request)
  const expected = body['expectedVersion']
  if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 1) {
    throw new HttpError(400, 'bad_request')
  }
  const settings = bytesField(body, 'settings', { min: MIN_SEALED_BYTES, max: MAX_SETTINGS_BYTES })
  const row = await db
    .prepare(
      `UPDATE users SET settings_ct = ?, settings_version = settings_version + 1, updated_at = ?
       WHERE id = ? AND settings_version = ? RETURNING settings_version`,
    )
    .bind(settings, now.getTime(), userId, expected)
    .first<{ settings_version: number }>()
  if (!row) return error(409, 'version_conflict')
  return json({ version: row.settings_version })
}

/** POST /api/password: マスターパスワードを変える。ほかのセッションを切る(Dev Spec 8 章) */
export async function changePassword(ctx: Ctx): Promise<Response> {
  const checked = await requireCurrentSecret(ctx)
  if (checked instanceof Response) return checked
  const { body, tokenHash } = checked
  const kdf = kdfField(body)
  const salt = bytesField(body, 'salt', SALT_BYTES)
  const auth = bytesField(body, 'authToken', AUTH_BYTES)
  const wrapped = bytesField(body, 'wrappedKey', WRAPPED_KEY_BYTES)
  const { db, userId, now, env } = ctx
  await db.batch([
    db
      .prepare(
        `UPDATE users SET kdf_params = ?, salt = ?, auth_hash = ?, wrapped_key = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        JSON.stringify(kdf),
        salt,
        await authHash(authPepper(env), auth),
        wrapped,
        now.getTime(),
        userId,
      ),
    db
      .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
      .bind(userId, tokenHash),
  ])
  return json({ ok: true })
}

/** POST /api/recovery-key: 回復キーを作り直す。古い回復キーは使えなくなる(PRD 5.2) */
export async function changeRecoveryKey(ctx: Ctx): Promise<Response> {
  const checked = await requireCurrentSecret(ctx)
  if (checked instanceof Response) return checked
  const { body } = checked
  const rSalt = bytesField(body, 'recoverySalt', SALT_BYTES)
  const rAuth = bytesField(body, 'recoveryAuthToken', AUTH_BYTES)
  const rWrapped = bytesField(body, 'recoveryWrappedKey', WRAPPED_KEY_BYTES)
  const { db, userId, now, env } = ctx
  await db
    .prepare(
      `UPDATE users SET recovery_salt = ?, recovery_auth_hash = ?, recovery_wrapped_key = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(rSalt, await authHash(authPepper(env), rAuth), rWrapped, now.getTime(), userId)
    .run()
  return json({ ok: true })
}

/**
 * POST /api/backup-keys: 今の合言葉を確かめ、バックアップに入れる包んだ鍵と塩を返す(Dev Spec 14 章)。
 * 回復で包んだ鍵は、普段は回復のときにしか返さないので、今のマスターパスワードを求める
 */
export async function backupKeys(ctx: Ctx): Promise<Response> {
  const checked = await requireCurrentSecret(ctx)
  if (checked instanceof Response) return checked
  const row = await ctx.db
    .prepare(
      'SELECT kdf_params, salt, wrapped_key, recovery_salt, recovery_wrapped_key FROM users WHERE id = ?',
    )
    .bind(ctx.userId)
    .first<{
      kdf_params: string
      salt: D1Blob
      wrapped_key: D1Blob
      recovery_salt: D1Blob
      recovery_wrapped_key: D1Blob
    }>()
  if (!row) return error(404, 'no_vault')
  return json({
    kdfParams: JSON.parse(row.kdf_params) as unknown,
    salt: toBase64(blobBytes(row.salt)),
    wrappedKey: toBase64(blobBytes(row.wrapped_key)),
    recoverySalt: toBase64(blobBytes(row.recovery_salt)),
    recoveryWrappedKey: toBase64(blobBytes(row.recovery_wrapped_key)),
  })
}

/** POST /api/delete-all: 自分のデータをすべて消す(件・セッション・金庫) */
export async function deleteAll(ctx: Ctx): Promise<Response> {
  const checked = await requireCurrentSecret(ctx)
  if (checked instanceof Response) return checked
  const { db, userId } = ctx
  await db.batch([
    db.prepare('DELETE FROM entries WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ])
  return json({ ok: true })
}
