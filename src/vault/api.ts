// Worker の /api/* を呼ぶ。同じ origin なので、Access の Cookie はブラウザが付ける
import type { ErrorCode, ErrorResponse } from '../shared/api-types.ts'
import { BadResponseError, type Parser } from './responses.ts'

/** 画面の側で決める理由。network = 届かなかった / bad_response = 応答の形が違った */
export type ClientErrorCode = ErrorCode | 'network' | 'bad_response'

// 引数での宣言(readonly status など)は使わない。Node.js の型を外す読み込み(見本のデータの台本)が受け付けないため
export class ApiError extends Error {
  readonly status: number
  readonly code: ClientErrorCode
  readonly lockedUntil?: number

  constructor(status: number, code: ClientErrorCode, lockedUntil?: number) {
    super(code)
    this.status = status
    this.code = code
    this.lockedUntil = lockedUntil
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface CallOptions {
  body?: unknown
  token?: string
  keepalive?: boolean
}

/**
 * Worker を呼ぶ。応答の中身を使うときは parse を渡し、形を確かめてから返す(形が違えば bad_response)。
 * parse を渡さなければ、成功したかだけを見て、中身は返さない
 */
export async function api(method: Method, path: string, options?: CallOptions): Promise<void>
export async function api<T>(
  method: Method,
  path: string,
  options: CallOptions & { parse: Parser<T> },
): Promise<T>
export async function api<T>(
  method: Method,
  path: string,
  options: CallOptions & { parse?: Parser<T> } = {},
): Promise<T | void> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`
  let res: Response
  try {
    const init: RequestInit = {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: options.keepalive,
    }
    if (method !== 'GET' && options.body !== undefined) init.body = JSON.stringify(options.body)
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'network')
  }
  const body = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const e = (body ?? {}) as Partial<ErrorResponse>
    throw new ApiError(res.status, e.error ?? 'internal_error', e.lockedUntil)
  }
  if (!options.parse) return
  try {
    return options.parse(body)
  } catch (err) {
    if (err instanceof BadResponseError) throw new ApiError(res.status, 'bad_response')
    throw err
  }
}
