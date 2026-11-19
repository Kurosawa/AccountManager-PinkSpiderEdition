// 1 件と設定の暗号(Dev Spec 3.3)。中身を JSON にして AES-256-GCM で暗号にする。返す値は IV(12 バイト)+ 暗号
import { concatBytes, randomBytes, utf8, wipe } from './bytes.ts'
import { IV_BYTES } from './keys.ts'

/** 1 件の AAD。ほかの行・ほかの人の暗号と入れ替えられたら、復号が失敗する */
export function entryAad(userId: string, entryId: string): string {
  return `am:v1:entry:${userId}:${entryId}`
}

/** パスキーの名前の AAD(Dev Spec 17.1)。ほかのパスキー・ほかの人の名前と入れ替えられたら、復号が失敗する */
export function passkeyNameAad(userId: string, credentialId: string): string {
  return `am:v1:passkey-name:${userId}:${credentialId}`
}

/** 設定の AAD */
export function settingsAad(userId: string): string {
  return `am:v1:settings:${userId}`
}

export async function encryptJson(
  vaultKey: CryptoKey,
  aad: string,
  value: unknown,
): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES)
  const plain = utf8(JSON.stringify(value))
  try {
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: utf8(aad) },
      vaultKey,
      plain,
    )
    return concatBytes(iv, new Uint8Array(ct))
  } finally {
    wipe(plain)
  }
}

/** 復号する。鍵・AAD が違う、または書き換えられていれば例外。中身の形の確かめは呼ぶ側で行う */
export async function decryptJson(
  vaultKey: CryptoKey,
  aad: string,
  data: Uint8Array,
): Promise<unknown> {
  if (data.length <= IV_BYTES) throw new Error('暗号の長さが違います')
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: data.slice(0, IV_BYTES), additionalData: utf8(aad) },
      vaultKey,
      data.slice(IV_BYTES),
    ),
  )
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain))
  } finally {
    wipe(plain)
  }
}
