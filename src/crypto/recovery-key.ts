// 回復キー(Dev Spec 3.1)。ランダムに 160 ビット = 32 文字(1 文字 5 ビット)。4 文字ずつ「-」で区切って見せる
// 文字は Crockford の Base32(読み違えやすい I・L・O・U を使わない)
import { randomBytes } from './bytes.ts'

export const RECOVERY_KEY_BYTES = 20
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LENGTH = 32

/** バイト列を 32 文字にする */
function encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out
}

/** 見せる形(XXXX-XXXX-…)にする */
export function formatRecoveryKey(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_KEY_BYTES) throw new Error('回復キーの長さが違います')
  return encode(bytes).match(/.{4}/g)!.join('-')
}

/** 新しい回復キーを作る。bytes は鍵の材料(使い終わったら wipe する)、text はユーザーに見せる控え */
export function generateRecoveryKey(): { bytes: Uint8Array; text: string } {
  const bytes = randomBytes(RECOVERY_KEY_BYTES)
  return { bytes, text: formatRecoveryKey(bytes) }
}

/**
 * 打ち込まれた回復キーをバイト列に戻す。読めなければ null。
 * 大文字・小文字、空白・「-」の有無は問わない。O は 0、I と L は 1 として読む(Crockford の決まり)
 */
export function parseRecoveryKey(input: string): Uint8Array | null {
  const text = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (text.length !== LENGTH) return null
  const out = new Uint8Array(RECOVERY_KEY_BYTES)
  let bits = 0
  let value = 0
  let i = 0
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) return null
    value = ((value << 5) | v) & 0xffff
    bits += 5
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  return out
}

/** 控えたことの確かめに使う、最後の 4 文字(Dev Spec 5.1 の 3) */
export function recoveryKeyTail(text: string): string {
  return text.replace(/-/g, '').slice(-4)
}
