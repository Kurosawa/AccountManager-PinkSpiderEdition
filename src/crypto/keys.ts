// 鍵の作りと、金庫の鍵を包む・開く(Dev Spec 3.1・3.4)
// 金庫の鍵のバイト列は JavaScript の側に出さない(Web Crypto の wrapKey・unwrapKey で包む・開く)
import { concatBytes, randomBytes, utf8, wipe } from './bytes.ts'
import { deriveMasterKey, type KdfParams } from './kdf.ts'
import { AUTH_BYTES, IV_BYTES } from '../shared/api-types.ts'
import { RECOVERY_KEY_BYTES } from './recovery-key.ts'

export { AUTH_BYTES, IV_BYTES } from '../shared/api-types.ts'

/** 包む鍵と、サーバーに送る合言葉の組 */
export interface DerivedKeys {
  /** 金庫の鍵を包む・開く鍵。取り出せない */
  wrapKey: CryptoKey
  /** サーバーに送る合言葉。送ったら呼ぶ側で wipe する */
  authToken: Uint8Array
}

const INFO = {
  wrap: 'am:v1:wrap',
  auth: 'am:v1:auth',
  rkWrap: 'am:v1:rk-wrap',
  rkAuth: 'am:v1:rk-auth',
  pkWrap: 'am:v1:pk-wrap',
  pkAuth: 'am:v1:pk-auth',
} as const

/** 包んだ金庫の鍵の AAD。ほかの人の行と入れ替えられたら開かない(Dev Spec 3.3 と同じ考え) */
export function vaultKeyAad(userId: string): Uint8Array<ArrayBuffer> {
  return utf8(`am:v1:vault-key:${userId}`)
}

async function hkdfSplit(
  ikm: Uint8Array,
  salt: Uint8Array,
  wrapInfo: string,
  authInfo: string,
): Promise<DerivedKeys> {
  const base = await crypto.subtle.importKey('raw', new Uint8Array(ikm), 'HKDF', false, [
    'deriveKey',
    'deriveBits',
  ])
  const params = (info: string): HkdfParams => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(salt),
    info: utf8(info),
  })
  const wrapKey = await crypto.subtle.deriveKey(
    params(wrapInfo),
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
  const authToken = new Uint8Array(
    await crypto.subtle.deriveBits(params(authInfo), base, AUTH_BYTES * 8),
  )
  return { wrapKey, authToken }
}

/** マスターパスワードから、包む鍵と合言葉を作る。親の鍵はここで消す */
export async function derivePasswordKeys(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<DerivedKeys> {
  const master = await deriveMasterKey(password, salt, params)
  try {
    return await hkdfSplit(master, new Uint8Array(0), INFO.wrap, INFO.auth)
  } finally {
    wipe(master)
  }
}

/** 回復キー(バイト列)から、回復の包む鍵と回復の合言葉を作る。回復キーは十分に長いので HKDF だけ */
export async function deriveRecoveryKeys(
  recoveryKey: Uint8Array,
  recoverySalt: Uint8Array,
): Promise<DerivedKeys> {
  if (recoveryKey.length !== RECOVERY_KEY_BYTES) throw new Error('回復キーの長さが違います')
  return hkdfSplit(recoveryKey, recoverySalt, INFO.rkWrap, INFO.rkAuth)
}

/**
 * パスキーの PRF の値(32 バイト)から、パスキーの包む鍵と合言葉を作る(Dev Spec 17 章)。
 * PRF の値はパスキーの中の秘密から作られ、十分に長いので HKDF だけ。salt には PRF に渡した値を使う
 */
export async function derivePasskeyKeys(
  prfOutput: Uint8Array,
  prfSalt: Uint8Array,
): Promise<DerivedKeys> {
  if (prfOutput.length !== 32) throw new Error('PRF の値の長さが違います')
  return hkdfSplit(prfOutput, prfSalt, INFO.pkWrap, INFO.pkAuth)
}

/** 新しい金庫の鍵を作る。包むためだけに取り出せる形で作り、包んだら捨てる */
export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/** 金庫の鍵を包む。返す値は IV(12 バイト)+ 暗号 */
export async function wrapVaultKey(
  vaultKey: CryptoKey,
  wrapKey: CryptoKey,
  userId: string,
): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES)
  const wrapped = await crypto.subtle.wrapKey('raw', vaultKey, wrapKey, {
    name: 'AES-GCM',
    iv,
    additionalData: vaultKeyAad(userId),
  })
  return concatBytes(iv, new Uint8Array(wrapped))
}

/**
 * 包んだ金庫の鍵を開く。合わなければ例外。
 * 普段は extractable を false にする。包み直すとき(マスターパスワードの変更など)だけ true にし、終わったら捨てる
 */
export async function unwrapVaultKey(
  wrapped: Uint8Array,
  wrapKey: CryptoKey,
  userId: string,
  extractable = false,
): Promise<CryptoKey> {
  if (wrapped.length <= IV_BYTES) throw new Error('包んだ鍵の長さが違います')
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped.slice(IV_BYTES),
    wrapKey,
    { name: 'AES-GCM', iv: wrapped.slice(0, IV_BYTES), additionalData: vaultKeyAad(userId) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

/** 包み直す(マスターパスワードの変更・回復キーの作り直し・回復。Dev Spec 3.1) */
export async function rewrapVaultKey(
  wrapped: Uint8Array,
  oldWrapKey: CryptoKey,
  newWrapKey: CryptoKey,
  userId: string,
): Promise<Uint8Array> {
  const key = await unwrapVaultKey(wrapped, oldWrapKey, userId, true)
  return wrapVaultKey(key, newWrapKey, userId)
}
