// 要求した利用者を決める(Dev Spec 4 章)。決められなければ null を返し、呼ぶ側は 401 にする。
// 設定が欠けているときも null にする(守りの側に倒す)
import type { JWTVerifyGetKey } from 'jose'
import { verifyAccessToken } from './access.ts'
import type { AppEnv } from './env.ts'

export interface IdentityDeps {
  /** Access の公開鍵(テストで差し替える) */
  keys?: JWTVerifyGetKey
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * 手元の開発の抜け道(Dev Spec 4.2)を使ってよいか。
 * ENVIRONMENT=development で、かつ要求のホストが localhost のときだけ
 */
export function devBypassAllowed(request: Request, env: AppEnv): boolean {
  if (env.ENVIRONMENT !== 'development') return false
  return LOCAL_HOSTS.has(new URL(request.url).hostname)
}

/** 利用者のメールアドレス(小文字)。分からなければ null */
export async function resolveEmail(
  request: Request,
  env: AppEnv,
  deps: IdentityDeps = {},
): Promise<string | null> {
  if (devBypassAllowed(request, env)) {
    const email = env.DEV_ACCESS_EMAIL?.trim().toLowerCase()
    return email && email.includes('@') ? email : null
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null
  return verifyAccessToken(request.headers.get('Cf-Access-Jwt-Assertion'), {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD,
    keys: deps.keys,
  })
}

const encoder = new TextEncoder()

/** HMAC-SHA256(鍵, 値) */
export async function hmacSha256(key: string, data: string | Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, bytes))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 利用者の ID = HMAC-SHA256(USER_ID_PEPPER, 小文字のメールアドレス) の 16 進(Dev Spec 4 章) */
export async function userIdFor(email: string, pepper: string): Promise<string> {
  return toHex(await hmacSha256(pepper, email.toLowerCase()))
}
