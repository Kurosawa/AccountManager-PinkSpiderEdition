// Cloudflare Access を通った要求かを、Worker の側でも確かめる(Dev Spec 4 章)。
// Access は要求に証明書(JWT。Cf-Access-Jwt-Assertion ヘッダー)を付ける。
// 署名(Access の公開鍵)、発行元(このチーム)、宛先(このアプリの AUD)、期限を確かめ、
// 証明書に入っているメールアドレスを返す
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export interface AccessOptions {
  /** Zero Trust のチームのドメイン(例: <チーム名>.cloudflareaccess.com) */
  teamDomain: string
  /** Access のアプリの AUD(Application Audience) */
  audience: string
  /** 公開鍵の取り出し方(テストで差し替える)。省略時はチームの公開鍵を取りに行く */
  keys?: JWTVerifyGetKey
}

// 公開鍵は、同じ Worker の中で使い回す(jose が取り直しの間隔を管理する)
const remoteKeys = new Map<string, JWTVerifyGetKey>()

function keysFor(teamDomain: string): JWTVerifyGetKey {
  let keys = remoteKeys.get(teamDomain)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    remoteKeys.set(teamDomain, keys)
  }
  return keys
}

/** 正しい証明書なら、小文字にそろえたメールアドレスを返す。そうでなければ null */
export async function verifyAccessToken(
  token: string | null,
  options: AccessOptions,
): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, options.keys ?? keysFor(options.teamDomain), {
      issuer: `https://${options.teamDomain}`,
      audience: options.audience,
      algorithms: ['RS256'],
    })
    const email = payload['email']
    return typeof email === 'string' && email.includes('@') ? email.toLowerCase() : null
  } catch {
    return null
  }
}
