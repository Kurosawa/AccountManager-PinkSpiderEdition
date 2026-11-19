// バイト列の小さな道具(Dev Spec 3 章)。ブラウザに組み込みの Web Crypto だけを使う

/** 暗号に使える乱数で n バイトを作る */
export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** 使い終わったバイト列を 0 で埋める(Dev Spec 3.4) */
export function wipe(...arrays: Array<Uint8Array | null | undefined>): void {
  for (const a of arrays) a?.fill(0)
}

/** 2 つ以上のバイト列をつなぐ */
export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const encoder = new TextEncoder()

/** 文字列を UTF-8 のバイト列にする */
export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text)
}
