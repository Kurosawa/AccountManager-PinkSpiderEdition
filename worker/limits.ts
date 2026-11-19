// 「数の確かめと足すこと」を 1 つの SQL で行ったあと、足せなかった理由を決める(1 件・パスキー)
import type { ErrorCode } from '../src/shared/api-types.ts'

/**
 * 足せなかった理由。自分の行の数だけを見て決め、ほかの人の行は調べない。
 * 上限に届いていれば limit_reached、そうでなければ ID が重なった(exists)。
 *
 * ID は表の中で利用者を問わず重ならない(主キー)ので、ほかの人の行と ID が重なっても exists になる。
 * 1 件の ID は端末で作るランダムな UUID、パスキーの ID は認証器が作るランダムな値で、
 * 重なることは事実上なく、重なっても分かるのは「その ID が使われている」ことだけ(中身も持ち主も分からない)
 */
export async function insertFailure(
  db: D1Database,
  table: 'entries' | 'passkeys',
  userId: string,
  limit: number,
  exists: Extract<ErrorCode, 'entry_exists' | 'passkey_exists'>,
): Promise<ErrorCode> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
    .bind(userId)
    .first<{ n: number }>()
  return (row?.n ?? 0) >= limit ? 'limit_reached' : exists
}
