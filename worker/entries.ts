// 1 件の読み書き(Dev Spec 8 章)。サーバーは暗号のまま置くだけで、中身は読めない。
// 直す・消すときは expectedVersion を比べ、違えば 409(ほかの端末で更新されている。discussion03 の 6)
import {
  ENTRY_ID_PATTERN,
  MAX_ENTRIES,
  MAX_ENTRY_BYTES,
  MIN_SEALED_BYTES,
  type EntryRecord,
} from '../src/shared/api-types.ts'
import { toBase64 } from '../src/shared/base64.ts'
import { blobBytes, bytesField, error, HttpError, json, readJson, type D1Blob } from './http.ts'
import { insertFailure } from './limits.ts'
import { requireSession } from './session.ts'
import type { Ctx } from './vault.ts'

function versionField(body: Record<string, unknown>): number {
  const v = body['expectedVersion']
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) {
    throw new HttpError(400, 'bad_request')
  }
  return v
}

function entryId(ctx: Ctx): string {
  const id = ctx.params['id'] ?? ''
  if (!ENTRY_ID_PATTERN.test(id)) throw new HttpError(404, 'not_found')
  return id
}

const ciphertextField = (body: Record<string, unknown>) =>
  bytesField(body, 'ciphertext', { min: MIN_SEALED_BYTES, max: MAX_ENTRY_BYTES })

/** GET /api/entries: 自分の全件(暗号のまま) */
export async function listEntries({ request, db, userId, now }: Ctx): Promise<Response> {
  await requireSession(request, db, userId, ['vault'], now)
  const { results } = await db
    .prepare('SELECT id, version, ciphertext FROM entries WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; version: number; ciphertext: D1Blob }>()
  const entries: EntryRecord[] = results.map((r) => ({
    id: r.id,
    version: r.version,
    ciphertext: toBase64(blobBytes(r.ciphertext)),
  }))
  return json({ entries })
}

/** POST /api/entries: 1 件を足す。同じ ID があれば 409、上限なら 409 limit_reached */
export async function createEntry({ request, db, userId, now }: Ctx): Promise<Response> {
  await requireSession(request, db, userId, ['vault'], now)
  const body = await readJson(request)
  const id = body['id']
  if (typeof id !== 'string' || !ENTRY_ID_PATTERN.test(id)) throw new HttpError(400, 'bad_request')
  const ciphertext = ciphertextField(body)
  // 件数の確かめと足すことを、1 つの文で行う(同時に足されても上限を超えない)
  const result = await db
    .prepare(
      `INSERT INTO entries (id, user_id, version, ciphertext, updated_at)
       SELECT ?1, ?2, 1, ?3, ?4
       WHERE (SELECT COUNT(*) FROM entries WHERE user_id = ?2) < ?5
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(id, userId, ciphertext, now.getTime(), MAX_ENTRIES)
    .run()
  if (result.meta.changes === 1) return json({ version: 1 }, 201)
  return error(409, await insertFailure(db, 'entries', userId, MAX_ENTRIES, 'entry_exists'))
}

/** 直す・消すのに失敗したときの応答。自分の件が無ければ 404、版が違えば 409 */
async function missOrConflict(db: D1Database, id: string, userId: string): Promise<Response> {
  const row = await db
    .prepare('SELECT 1 FROM entries WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first()
  return row ? error(409, 'version_conflict') : error(404, 'not_found')
}

/** PUT /api/entries/:id: 1 件を直す。版を 1 つ進める */
export async function updateEntry(ctx: Ctx): Promise<Response> {
  const { request, db, userId, now } = ctx
  await requireSession(request, db, userId, ['vault'], now)
  const id = entryId(ctx)
  const body = await readJson(request)
  const expected = versionField(body)
  const ciphertext = ciphertextField(body)
  const row = await db
    .prepare(
      `UPDATE entries SET ciphertext = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND version = ? RETURNING version`,
    )
    .bind(ciphertext, now.getTime(), id, userId, expected)
    .first<{ version: number }>()
  if (!row) return missOrConflict(db, id, userId)
  return json({ version: row.version })
}

/** DELETE /api/entries/:id: 1 件を消す */
export async function deleteEntry(ctx: Ctx): Promise<Response> {
  const { request, db, userId, now } = ctx
  await requireSession(request, db, userId, ['vault'], now)
  const id = entryId(ctx)
  const expected = versionField(await readJson(request))
  const result = await db
    .prepare('DELETE FROM entries WHERE id = ? AND user_id = ? AND version = ?')
    .bind(id, userId, expected)
    .run()
  if (result.meta.changes !== 1) return missOrConflict(db, id, userId)
  return json({ ok: true })
}
