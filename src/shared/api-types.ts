// API の本文の形と、大きさの決まり(Dev Spec 5・8 章)。画面と Worker の両方で使う。
// バイト列はすべて base64 の文字列で送る
import type { KdfParams } from './kdf-params.ts'

export const SALT_BYTES = 16
/** AES-GCM の IV */
export const IV_BYTES = 12
/** AES-GCM の認証タグ */
export const GCM_TAG_BYTES = 16
/** 暗号(IV + 暗号文 + 認証タグ)の最も短い大きさ。中身が 1 バイト以上あること */
export const MIN_SEALED_BYTES = IV_BYTES + GCM_TAG_BYTES + 1
/** 合言葉(HKDF で作る 32 バイト) */
export const AUTH_BYTES = 32
/** 包んだ金庫の鍵 = IV 12 + 鍵 32 + 認証タグ 16 */
export const WRAPPED_KEY_BYTES = 60
/** セッションのトークン */
export const SESSION_TOKEN_BYTES = 32
/** 暗号にした設定の上限。中身は数個の値だけなので、1 件の上限と同じにして十分に余らせる */
export const MAX_SETTINGS_BYTES = 64 * 1024
/** 要求の本文の上限。いちばん大きい要求(64 KiB の暗号を base64 にした約 86 KiB と、ほかの項目)が入る大きさ */
export const MAX_BODY_BYTES = 256 * 1024

/** 失敗をこの回数続けたら待たせる(Dev Spec 5.2) */
export const MAX_FAILED_ATTEMPTS = 10
/** 待たせる長さ */
export const LOCKOUT_MS = 60 * 60 * 1000

export interface MeResponse {
  userId: string
  vault: {
    kdfParams: unknown
    salt: string
    recoverySalt: string
    /** 待たせている間は、その終わりの時刻(UNIX 時刻のミリ秒) */
    lockedUntil: number | null
    /** パスキーで開けるか(Dev Spec 17 章) */
    passkeys: PasskeyUnlockInfo
  } | null
}

/**
 * パスキーで開けるか。none = 登録が無い / password_due = 最後にマスターパスワードで開いてから 2 週間たった /
 * available = 開ける(登録したパスキーの ID と、PRF に渡す値。どちらも秘密ではない)
 */
export type PasskeyUnlockInfo =
  | { state: 'none' | 'password_due' }
  | { state: 'available'; credentials: Array<{ id: string; prfSalt: string }> }

/** マスターパスワードで開くよう求める間隔(discussion38 の 3) */
export const PASSWORD_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000

/** POST /api/unlock/passkey */
export interface PasskeyUnlockRequest {
  credentialId: string
  authToken: string
}

/** パスキーで開いた答え。マスターパスワードで包んだ鍵(wrappedKey)も返す(今のマスターパスワードを求める操作で使う) */
export interface PasskeyUnlockResponse extends TokenResponse {
  wrappedKey: string
  passkeyWrappedKey: string
  settings: string
  settingsVersion: number
}

/** POST /api/vault */
export interface CreateVaultRequest {
  kdfParams: KdfParams
  salt: string
  authToken: string
  wrappedKey: string
  recoverySalt: string
  recoveryAuthToken: string
  recoveryWrappedKey: string
  settings: string
}

export interface TokenResponse {
  token: string
}

/** POST /api/unlock */
export interface UnlockRequest {
  authToken: string
}

export interface UnlockResponse extends TokenResponse {
  wrappedKey: string
  settings: string
  settingsVersion: number
}

/** POST /api/recover */
export interface RecoverRequest {
  recoveryAuthToken: string
}

export interface RecoverResponse extends TokenResponse {
  recoveryWrappedKey: string
}

/** POST /api/recover/complete(回復のトークンで呼ぶ) */
export interface RecoverCompleteRequest {
  kdfParams: KdfParams
  salt: string
  authToken: string
  wrappedKey: string
}

export interface RecoverCompleteResponse extends TokenResponse {
  settings: string
  settingsVersion: number
}

/** 1 件の暗号の上限(Dev Spec 8 章)。メモやバックアップコードを長く書いても届かない大きさ */
export const MAX_ENTRY_BYTES = 64 * 1024
/** 1 人の件数の上限。ふつうの使い方より十分に多く、一覧の応答とバックアップの大きさに天井を作る */
export const MAX_ENTRIES = 2000

/** D1 に置いた 1 件(暗号のまま) */
export interface EntryRecord {
  /** ブラウザで作る UUID */
  id: string
  version: number
  /** IV + 暗号(base64) */
  ciphertext: string
}

/** GET /api/entries */
export interface ListEntriesResponse {
  entries: EntryRecord[]
}

/** POST /api/entries */
export interface CreateEntryRequest {
  id: string
  ciphertext: string
}

/** PUT /api/entries/:id */
export interface UpdateEntryRequest {
  expectedVersion: number
  ciphertext: string
}

/** DELETE /api/entries/:id */
export interface DeleteEntryRequest {
  expectedVersion: number
}

export interface VersionResponse {
  version: number
}

/** PUT /api/settings */
export interface UpdateSettingsRequest {
  expectedVersion: number
  /** 暗号にした設定(base64) */
  settings: string
}

/**
 * 今のマスターパスワードを求める操作(Dev Spec 8 章)。サーバーは currentAuthToken を先に確かめ、
 * 失敗の回数に数える。そのあとで残りの項目を確かめる。
 * 画面は、今のマスターパスワードが違うと分かっていても currentAuthToken だけを送り、回数に数えさせる
 */
export interface CurrentSecret {
  currentAuthToken: string
}

/** POST /api/password(ほかのセッションを切る) */
export interface ChangePasswordRequest extends CurrentSecret {
  kdfParams?: KdfParams
  salt?: string
  authToken?: string
  wrappedKey?: string
}

/** POST /api/recovery-key */
export interface ChangeRecoveryKeyRequest extends CurrentSecret {
  recoverySalt?: string
  recoveryAuthToken?: string
  recoveryWrappedKey?: string
}

/** POST /api/delete-all */
export type DeleteAllRequest = CurrentSecret

/** POST /api/backup-keys(本文は CurrentSecret)。バックアップに入れる、包んだ鍵と塩(Dev Spec 14 章) */
export interface BackupKeysResponse {
  kdfParams: KdfParams
  salt: string
  wrappedKey: string
  recoverySalt: string
  recoveryWrappedKey: string
}

/** 1 人が登録できるパスキーの数(discussion38 の 2) */
export const MAX_PASSKEYS = 5
/** パスキーの名前の長さの上限(文字) */
export const MAX_PASSKEY_NAME = 40
/** 暗号にしたパスキーの名前の大きさの上限(IV 12 + 40 文字の JSON + タグ 16 が収まる。バイト) */
export const MAX_PASSKEY_NAME_CT_BYTES = 512
/** PRF に渡す値の長さ */
export const PRF_SALT_BYTES = 32
/** パスキーの credential ID の形(base64url。仕様の上限 1023 バイトが収まる長さ) */
export const CREDENTIAL_ID_PATTERN = /^[A-Za-z0-9_-]{16,1400}$/

/** 登録したパスキー(秘密の値は含まない) */
export interface PasskeyInfo {
  /** credential ID(base64url) */
  id: string
  /** 金庫の鍵で暗号にした名前(base64)。前の版で登録したものは null */
  nameCiphertext: string | null
  /** 前の版で登録した、暗号でない名前。暗号にして置き直したら null(discussion47 の 1) */
  legacyName: string | null
  /** 登録した時刻(UNIX 時刻・ミリ秒) */
  createdAt: number
}

/** GET /api/passkeys */
export interface ListPasskeysResponse {
  passkeys: PasskeyInfo[]
}

/** POST /api/passkeys(今のマスターパスワードを求める。Dev Spec 17 章) */
export interface AddPasskeyRequest extends CurrentSecret {
  credentialId: string
  /** 金庫の鍵で暗号にした名前(base64。AAD は passkeyNameAad) */
  nameCiphertext: string
  prfSalt: string
  /** パスキーの合言葉 */
  authToken: string
  /** パスキーの包む鍵で包んだ金庫の鍵 */
  wrappedKey: string
}

/** PUT /api/passkeys/:id/name: 暗号でない名前を、暗号にして置き直す */
export interface RenamePasskeyRequest {
  nameCiphertext: string
}

/** 件の ID の形(小文字の UUID) */
export const ENTRY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** エラーの本文。理由の種類と、待たせている時刻だけを返す(Dev Spec 8 章) */
export interface ErrorResponse {
  error: ErrorCode
  lockedUntil?: number
}

export type ErrorCode =
  | 'unauthorized'
  | 'server_misconfigured'
  | 'not_found'
  | 'method_not_allowed'
  | 'bad_request'
  | 'too_large'
  | 'no_vault'
  | 'vault_exists'
  | 'wrong_secret'
  | 'locked'
  | 'invalid_session'
  | 'version_conflict'
  | 'entry_exists'
  | 'limit_reached'
  | 'passkey_exists'
  | 'password_due'
  | 'internal_error'
