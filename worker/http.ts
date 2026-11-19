// 応答の作り方と、要求の本文の読み方
import { fromBase64 } from '../src/shared/base64.ts'
import { MAX_BODY_BYTES, type ErrorCode } from '../src/shared/api-types.ts'

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** エラーの本文は、理由の種類(と待たせている時刻)だけにする(内部の情報を出さない。Dev Spec 8 章) */
export function error(status: number, code: ErrorCode, extra?: { lockedUntil: number }): Response {
  return json({ error: code, ...extra }, status)
}

/** 要求の誤り。投げると、呼ぶ側の入口で応答に変わる */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
  ) {
    super(code)
  }
}

/** JSON の本文を読む。大きすぎる・JSON でない・オブジェクトでないときは HttpError */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'too_large')
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'bad_request')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'bad_request')
  }
  return body as Record<string, unknown>
}

/** base64 のバイト列を読む。長さが決まっていれば確かめる */
export function bytesField(
  body: Record<string, unknown>,
  name: string,
  length: number | { max: number; min?: number },
): Uint8Array<ArrayBuffer> {
  const bytes = fromBase64(body[name])
  const ok =
    bytes !== null &&
    (typeof length === 'number'
      ? bytes.length === length
      : bytes.length >= (length.min ?? 1) && bytes.length <= length.max)
  if (!ok) throw new HttpError(400, 'bad_request')
  return bytes
}

/** D1 の BLOB の列の値。D1 は ArrayBuffer ではなく数の配列で返すことがあるので、どちらも受ける */
export type D1Blob = ArrayBuffer | ArrayBufferView | number[]

/** D1 の BLOB の値をバイト列にそろえる */
export function blobBytes(value: D1Blob): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  if (ArrayBuffer.isView(value)) {
    return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }
  return Uint8Array.from(value)
}
