// バイト列と base64 の変換。画面と Worker の両方で使う(API の本文でバイト列を送るため)

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of array) s += String.fromCharCode(b)
  return btoa(s)
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** base64 をバイト列に戻す。base64 でなければ null */
export function fromBase64(text: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof text !== 'string' || !BASE64.test(text)) return null
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
