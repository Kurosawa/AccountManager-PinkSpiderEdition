// 強いパスワードを作る(Dev Spec 9.4)。crypto.getRandomValues で、偏りが出ない方法で文字を選ぶ

export const CHAR_SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
} as const

export type CharSet = keyof typeof CHAR_SETS

export interface GeneratorOptions {
  length: number
  sets: Record<CharSet, boolean>
}

export const MIN_LENGTH = 8
export const MAX_LENGTH = 64

/** 初期値: 20 文字・英大文字・小文字・数字・記号(discussion03 の 8) */
export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  sets: { upper: true, lower: true, digits: true, symbols: true },
}

/** 0 以上 n 未満の整数を、偏りなく選ぶ(はみ出した値は捨てて引き直す) */
export function randomIndex(n: number, random = cryptoUint32): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new Error('範囲が違います')
  const limit = 2 ** 32 - (2 ** 32 % n)
  for (;;) {
    const x = random()
    if (x < limit) return x % n
  }
}

function cryptoUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!
}

/**
 * パスワードを作る。選んだ文字の種類は、それぞれ少なくとも 1 文字ずつ入る
 * (入っていなければ全体を作り直す。作り直しは確率で決まり、選ぶ文字に偏りは出ない)
 */
export function generatePassword(options: GeneratorOptions = DEFAULT_GENERATOR): string {
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.trunc(options.length)))
  const sets = (Object.keys(CHAR_SETS) as CharSet[]).filter((k) => options.sets[k])
  if (sets.length === 0) throw new Error('文字の種類を 1 つ以上選んでください')
  const alphabet = sets.map((k) => CHAR_SETS[k]).join('')
  for (;;) {
    let out = ''
    for (let i = 0; i < length; i++) out += alphabet[randomIndex(alphabet.length)]
    if (sets.every((k) => [...CHAR_SETS[k]].some((c) => out.includes(c)))) return out
  }
}
