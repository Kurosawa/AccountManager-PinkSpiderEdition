// Worker の応答の形を確かめる。形が違えば BadResponseError を投げる(api.ts が ApiError の bad_response にする)。
// 応答は自分の Worker から来るが、暗号の部品に渡す前に、型を付けるだけでなく中身を確かめる
import type {
  BackupKeysResponse,
  EntryRecord,
  ListEntriesResponse,
  ListPasskeysResponse,
  MeResponse,
  PasskeyInfo,
  PasskeyUnlockInfo,
  PasskeyUnlockResponse,
  RecoverCompleteResponse,
  RecoverResponse,
  TokenResponse,
  UnlockResponse,
  VersionResponse,
} from '../shared/api-types.ts'
import { parseKdfParams } from '../shared/kdf-params.ts'

export class BadResponseError extends Error {
  constructor(path: string) {
    super(`応答の形が違います: ${path}`)
    this.name = 'BadResponseError'
  }
}

/** 値を確かめて T にする。path は、形が違ったときの説明に使う */
export type Parser<T> = (value: unknown, path?: string) => T

const fail = (path: string): never => {
  throw new BadResponseError(path)
}

const record = (value: unknown, path: string): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(path)

export const string: Parser<string> = (v, path = '$') => (typeof v === 'string' ? v : fail(path))

export const integer: Parser<number> = (v, path = '$') =>
  typeof v === 'number' && Number.isSafeInteger(v) ? v : fail(path)

export const nullable =
  <T>(inner: Parser<T>): Parser<T | null> =>
  (v, path = '$') =>
    v === null ? null : inner(v, path)

export const arrayOf =
  <T>(item: Parser<T>): Parser<T[]> =>
  (v, path = '$') =>
    Array.isArray(v) ? v.map((x, i) => item(x, `${path}[${i}]`)) : fail(path)

/** 決めた項目だけを確かめて取り出す(余分な項目は捨てる) */
export const object =
  <T>(shape: { [K in keyof T]: Parser<T[K]> }): Parser<T> =>
  (v, path = '$') => {
    const r = record(v, path)
    const out = {} as T
    for (const key of Object.keys(shape) as Array<keyof T & string>) {
      out[key] = shape[key](r[key], `${path}.${key}`)
    }
    return out
  }

const kdfParams: Parser<BackupKeysResponse['kdfParams']> = (v, path = '$') => {
  try {
    return parseKdfParams(v)
  } catch {
    return fail(path)
  }
}

const passkeyUnlockInfo: Parser<PasskeyUnlockInfo> = (v, path = '$') => {
  const state = record(v, path)['state']
  if (state === 'none' || state === 'password_due') return { state }
  if (state === 'available') {
    return {
      state,
      credentials: object<{ credentials: Array<{ id: string; prfSalt: string }> }>({
        credentials: arrayOf(object({ id: string, prfSalt: string })),
      })(v, path).credentials,
    }
  }
  return fail(`${path}.state`)
}

const entryRecord = object<EntryRecord>({ id: string, version: integer, ciphertext: string })

const passkeyInfo = object<PasskeyInfo>({
  id: string,
  nameCiphertext: nullable(string),
  legacyName: nullable(string),
  createdAt: integer,
})

export const parseMe = object<MeResponse>({
  userId: string,
  vault: nullable(
    object<NonNullable<MeResponse['vault']>>({
      // 範囲の確かめは鍵を作る前に kdf.ts でも行う。ここでは形だけを見る
      kdfParams: (v) => v,
      salt: string,
      recoverySalt: string,
      lockedUntil: nullable(integer),
      passkeys: passkeyUnlockInfo,
    }),
  ),
})

export const parseToken = object<TokenResponse>({ token: string })

export const parseUnlock = object<UnlockResponse>({
  token: string,
  wrappedKey: string,
  settings: string,
  settingsVersion: integer,
})

export const parsePasskeyUnlock = object<PasskeyUnlockResponse>({
  token: string,
  wrappedKey: string,
  passkeyWrappedKey: string,
  settings: string,
  settingsVersion: integer,
})

export const parseRecover = object<RecoverResponse>({ token: string, recoveryWrappedKey: string })

export const parseRecoverComplete = object<RecoverCompleteResponse>({
  token: string,
  settings: string,
  settingsVersion: integer,
})

export const parseVersion = object<VersionResponse>({ version: integer })

export const parseListEntries = object<ListEntriesResponse>({ entries: arrayOf(entryRecord) })

export const parseListPasskeys = object<ListPasskeysResponse>({ passkeys: arrayOf(passkeyInfo) })

export const parseBackupKeys = object<BackupKeysResponse>({
  kdfParams,
  salt: string,
  wrappedKey: string,
  recoverySalt: string,
  recoveryWrappedKey: string,
})
