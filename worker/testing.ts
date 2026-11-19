// Worker のテスト用の道具。手元の D1(wrangler の getPlatformProxy。保存しない)にマイグレーションを流して使う
import { getPlatformProxy } from 'wrangler'
import init from '../migrations/0001_init.sql?raw'
import passkeys from '../migrations/0002_passkeys.sql?raw'
import passwordUnlockedAt from '../migrations/0003_password_unlocked_at.sql?raw'
import passkeyNameCiphertext from '../migrations/0004_passkey_name_ciphertext.sql?raw'
import type { Deps } from './api.ts'
import type { AppEnv } from './env.ts'
import { handle } from './index.ts'

const MIGRATIONS = [init, passkeys, passwordUnlockedAt, passkeyNameCiphertext]
// 消す順番は、ほかの表から参照される表を最後にする
const TABLES = ['sessions', 'entries', 'passkeys', 'users']

function statements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function startDb() {
  const proxy = await getPlatformProxy<Env>({ persist: false })
  const db = proxy.env.DB
  for (const sql of MIGRATIONS) await db.batch(statements(sql).map((s) => db.prepare(s)))
  return {
    db,
    dispose: () => proxy.dispose(),
    /** すべての表を空にする */
    reset: () => db.batch(TABLES.map((t) => db.prepare(`DELETE FROM ${t}`))),
  }
}

export const TEST_PEPPERS = {
  USER_ID_PEPPER: 'test-user-id-pepper',
  AUTH_PEPPER: 'test-auth-pepper',
}

export const BASE_NOW = new Date('2026-11-15T03:00:00Z')

export interface CallOptions {
  /** 今の時刻(既定は BASE_NOW) */
  now?: Date
  /** 既定は localhost */
  host?: string
  headers?: Record<string, string>
  /** 既定は手元の開発の設定(ENVIRONMENT=development・DEV_ACCESS_EMAIL)。上書きできる */
  env?: Partial<AppEnv>
  /** true なら手元の開発の設定を入れない */
  noDevDefaults?: boolean
  deps?: Deps
}

export function caller(db: D1Database) {
  return async (method: string, path: string, body?: unknown, o: CallOptions = {}) => {
    const headers: Record<string, string> = { ...o.headers }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const request = new Request(`http://${o.host ?? 'localhost'}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const dev = o.noDevDefaults
      ? {}
      : { ENVIRONMENT: 'development', DEV_ACCESS_EMAIL: 'dev@example.com' }
    const env = { DB: db, ...TEST_PEPPERS, ...dev, ...o.env } as AppEnv
    const res = await handle(request, env, { now: () => o.now ?? BASE_NOW, ...o.deps })
    // oxlint-disable-next-line typescript/no-explicit-any -- テストで応答の中身を自由に見るため
    return { status: res.status, headers: res.headers, body: (await res.json()) as any }
  }
}

/** n バイトのランダムな値の base64。getRandomValues は 1 回に 64 KiB までなので、分けて埋める */
export function randomBase64(n: number): string {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, i + 65536))
  let s = ''
  for (const b of out) s += String.fromCharCode(b)
  return btoa(s)
}
