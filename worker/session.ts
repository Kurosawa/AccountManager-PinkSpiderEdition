// セッション(Dev Spec 5.4)。トークンは 32 バイトのランダムな値で、D1 には SHA-256 したものだけを置く。
// トークンは Access の利用者と結びつけ、別の利用者の JWT では使えない
import { SESSION_TOKEN_BYTES } from '../src/shared/api-types.ts'
import { fromBase64, toBase64 } from '../src/shared/base64.ts'
import { HttpError } from './http.ts'

export type SessionPurpose = 'vault' | 'recover'

/** 決まり(Dev Spec 5.4) */
export const SESSION_LIMITS = {
  /** 金庫のセッション: 最後に使ってから */
  vaultIdleMs: 30 * 60 * 1000,
  /** 金庫のセッション: 作ってから */
  vaultMaxMs: 12 * 60 * 60 * 1000,
  /** 回復のセッション: 作ってから(使っても延びない) */
  recoverMaxMs: 10 * 60 * 1000,
} as const

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

/** セッションを始め、トークン(base64)を返す。ついでに、その利用者の切れたセッションを消す */
export async function createSession(
  db: D1Database,
  userId: string,
  purpose: SessionPurpose,
  now: Date,
): Promise<string> {
  const token = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES))
  const t = now.getTime()
  const expires =
    t + (purpose === 'vault' ? SESSION_LIMITS.vaultMaxMs : SESSION_LIMITS.recoverMaxMs)
  await db.batch([
    db
      .prepare(
        'DELETE FROM sessions WHERE user_id = ? AND (expires_at <= ? OR (purpose = ? AND last_used_at <= ?))',
      )
      .bind(userId, t, 'vault', t - SESSION_LIMITS.vaultIdleMs),
    db
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, purpose, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(await sha256(token), userId, purpose, t, t, expires),
  ])
  return toBase64(token)
}

function bearerToken(request: Request): Uint8Array<ArrayBuffer> | null {
  const match = /^Bearer ([A-Za-z0-9+/=]+)$/.exec(request.headers.get('Authorization') ?? '')
  const token = match ? fromBase64(match[1]) : null
  return token && token.length === SESSION_TOKEN_BYTES ? token : null
}

/**
 * 要求のトークンを確かめる。使える目的(purposes)のセッションで、この利用者のもので、切れていなければ、
 * そのトークンの SHA-256 を返す。だめなら 401 invalid_session。金庫のセッションは、最後に使った時刻を更新する
 */
export async function requireSession(
  request: Request,
  db: D1Database,
  userId: string,
  purposes: readonly SessionPurpose[],
  now: Date,
): Promise<Uint8Array<ArrayBuffer>> {
  const token = bearerToken(request)
  if (!token) throw new HttpError(401, 'invalid_session')
  const hash = await sha256(token)
  const t = now.getTime()
  const row = await db
    .prepare('SELECT user_id, purpose, last_used_at, expires_at FROM sessions WHERE token_hash = ?')
    .bind(hash)
    .first<{ user_id: string; purpose: SessionPurpose; last_used_at: number; expires_at: number }>()
  const valid =
    row !== null &&
    row.user_id === userId &&
    purposes.includes(row.purpose) &&
    row.expires_at > t &&
    (row.purpose !== 'vault' || row.last_used_at + SESSION_LIMITS.vaultIdleMs > t)
  if (!valid) throw new HttpError(401, 'invalid_session')
  if (row.purpose === 'vault') {
    await db
      .prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?')
      .bind(t, hash)
      .run()
  }
  return hash
}

export async function deleteSession(db: D1Database, tokenHash: Uint8Array<ArrayBuffer>) {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
}
