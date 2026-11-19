// Argon2id の強さ(Dev Spec 3.2・3.5)。画面は鍵を作る前に、Worker は金庫を作るときに確かめる

export interface KdfParams {
  alg: 'argon2id'
  /** メモリ(KiB) */
  m: number
  /** 繰り返し */
  t: number
  /** 並列 */
  p: number
}

/** 初期値(スマホで測って決めた。Dev Spec 3.2・11 章) */
export const DEFAULT_KDF_PARAMS: KdfParams = { alg: 'argon2id', m: 65536, t: 3, p: 1 }

/**
 * 受け付ける強さの範囲。kdf_params はサーバーから受け取るので、
 * サーバーや D1 を書き換えられて弱い値を渡されても、それでは鍵を作らない。
 * 下限は OWASP の Argon2id の最小の勧め(19 MiB・2 回)、上限は端末が固まらない程度
 */
export const KDF_LIMITS = {
  m: { min: 19456, max: 1048576 },
  t: { min: 2, max: 10 },
  p: { min: 1, max: 4 },
} as const

function inRange(v: unknown, r: { min: number; max: number }): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= r.min && v <= r.max
}

/** 受け取った値を確かめて KdfParams にする。範囲の外なら例外 */
export function parseKdfParams(value: unknown): KdfParams {
  const v = value as Partial<Record<keyof KdfParams, unknown>> | null
  if (
    !v ||
    typeof v !== 'object' ||
    v.alg !== 'argon2id' ||
    !inRange(v.m, KDF_LIMITS.m) ||
    !inRange(v.t, KDF_LIMITS.t) ||
    !inRange(v.p, KDF_LIMITS.p)
  ) {
    throw new Error('kdf_params が受け付ける範囲の外です')
  }
  return { alg: 'argon2id', m: v.m, t: v.t, p: v.p }
}
