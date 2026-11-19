// /api/* の振り分け(Dev Spec 8 章)。すべての要求で、まず Access の利用者を確かめる
import type { MeResponse } from '../src/shared/api-types.ts'
import { toBase64 } from '../src/shared/base64.ts'
import type { AppEnv } from './env.ts'
import { blobBytes, error, HttpError, json, type D1Blob } from './http.ts'
import { resolveEmail, userIdFor, type IdentityDeps } from './identity.ts'
import { createEntry, deleteEntry, listEntries, updateEntry } from './entries.ts'
import {
  addPasskey,
  deletePasskey,
  listPasskeys,
  renamePasskey,
  passkeyUnlockInfo,
  unlockWithPasskey,
} from './passkeys.ts'
import {
  backupKeys,
  changePassword,
  changeRecoveryKey,
  deleteAll,
  updateSettings,
} from './settings.ts'
import { createVault, lock, recover, recoverComplete, unlock, type Ctx } from './vault.ts'

export { error, json } from './http.ts'

export interface Deps extends IdentityDeps {
  /** 今の時刻(テストで差し替える) */
  now?: () => Date
}

interface UserRow {
  kdf_params: string
  salt: D1Blob
  recovery_salt: D1Blob
  locked_until: number | null
  password_unlocked_at: number | null
}

async function me({ db, userId, now }: Ctx): Promise<Response> {
  const row = await db
    .prepare(
      'SELECT kdf_params, salt, recovery_salt, locked_until, password_unlocked_at FROM users WHERE id = ?',
    )
    .bind(userId)
    .first<UserRow>()
  if (!row) return json({ userId, vault: null } satisfies MeResponse)
  const lockedUntil =
    row.locked_until !== null && row.locked_until > now.getTime() ? row.locked_until : null
  return json({
    userId,
    vault: {
      kdfParams: JSON.parse(row.kdf_params) as unknown,
      salt: toBase64(blobBytes(row.salt)),
      recoverySalt: toBase64(blobBytes(row.recovery_salt)),
      lockedUntil,
      passkeys: await passkeyUnlockInfo(db, userId, row.password_unlocked_at, now),
    },
  } satisfies MeResponse)
}

type Handler = (ctx: Ctx) => Promise<Response>

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  '/api/me': { GET: me },
  '/api/vault': { POST: createVault },
  '/api/unlock': { POST: unlock },
  '/api/unlock/passkey': { POST: unlockWithPasskey },
  '/api/recover': { POST: recover },
  '/api/recover/complete': { POST: recoverComplete },
  '/api/lock': { POST: lock },
  '/api/entries': { GET: listEntries, POST: createEntry },
  '/api/settings': { PUT: updateSettings },
  '/api/password': { POST: changePassword },
  '/api/recovery-key': { POST: changeRecoveryKey },
  '/api/delete-all': { POST: deleteAll },
  '/api/backup-keys': { POST: backupKeys },
  '/api/passkeys': { GET: listPasskeys, POST: addPasskey },
}

/** :id を含むパス */
const PARAM_ROUTES: Array<[RegExp, Partial<Record<string, Handler>>]> = [
  [/^\/api\/entries\/(?<id>[^/]+)$/, { PUT: updateEntry, DELETE: deleteEntry }],
  [/^\/api\/passkeys\/(?<id>[^/]+)$/, { DELETE: deletePasskey }],
  [/^\/api\/passkeys\/(?<id>[^/]+)\/name$/, { PUT: renamePasskey }],
]

function findRoute(pathname: string) {
  const route = ROUTES[pathname]
  if (route) return { route, params: {} }
  for (const [pattern, r] of PARAM_ROUTES) {
    const m = pattern.exec(pathname)
    if (m) return { route: r, params: { ...m.groups } }
  }
  return null
}

export async function handleApi(request: Request, env: AppEnv, deps: Deps = {}): Promise<Response> {
  const { pathname } = new URL(request.url)
  const now = deps.now?.() ?? new Date()

  if (pathname === '/api/health') {
    if (request.method !== 'GET') return error(405, 'method_not_allowed')
    await env.DB.prepare('SELECT 1').first()
    return json({ ok: true })
  }

  // /api/health 以外は、まず利用者を確かめる(知らないパスでも、先に 401 を返す)
  const email = await resolveEmail(request, env, deps)
  if (!email) return error(401, 'unauthorized')
  if (!env.USER_ID_PEPPER) return error(500, 'server_misconfigured')

  const found = findRoute(pathname)
  if (!found) return error(404, 'not_found')
  const handler = found.route[request.method]
  if (!handler) return error(405, 'method_not_allowed')

  const userId = await userIdFor(email, env.USER_ID_PEPPER)
  try {
    return await handler({ request, env, db: env.DB, userId, now, params: found.params })
  } catch (e) {
    if (e instanceof HttpError) return error(e.status, e.code)
    throw e
  }
}
