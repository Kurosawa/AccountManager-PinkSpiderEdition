// 金庫を作る・開ける・閉じる・回復の流れ(Dev Spec 5 章)。暗号の部品(src/crypto)と API をつなぐ。
// 鍵とトークンはメモリだけに持ち、localStorage などには置かない(Dev Spec 3.4)
import { randomBytes, wipe } from '../crypto/bytes.ts'
import { SALT_BYTES } from '../crypto/kdf.ts'
import {
  derivePasswordKeys,
  deriveRecoveryKeys,
  generateVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
} from '../crypto/keys.ts'
import { decryptJson, encryptJson, settingsAad } from '../crypto/record.ts'
import { generateRecoveryKey, parseRecoveryKey } from '../crypto/recovery-key.ts'
import type {
  ChangePasswordRequest,
  ChangeRecoveryKeyRequest,
  CurrentSecret,
  DeleteAllRequest,
  UpdateSettingsRequest,
  CreateVaultRequest,
  PasskeyUnlockInfo,
  RecoverCompleteRequest,
  RecoverCompleteResponse,
  RecoverResponse,
  UnlockResponse,
} from '../shared/api-types.ts'
import { fromBase64, toBase64 } from '../shared/base64.ts'
import { DEFAULT_KDF_PARAMS, parseKdfParams, type KdfParams } from '../shared/kdf-params.ts'
import { api } from './api.ts'
import {
  parseMe,
  parseRecover,
  parseRecoverComplete,
  parseToken,
  parseUnlock,
  parseVersion,
} from './responses.ts'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './settings.ts'

/** 開いている金庫。閉じたら参照ごと捨てる */
export interface OpenVault {
  userId: string
  token: string
  /** 取り出せない CryptoKey */
  vaultKey: CryptoKey
  settings: Settings
  settingsVersion: number
  /** 今のマスターパスワードの salt と強さ(今のマスターパスワードを求める操作で使う) */
  salt: Uint8Array
  kdfParams: KdfParams
  /** 包んだ金庫の鍵(暗号。包み直すときに使う) */
  wrappedKey: Uint8Array
}

/** /api/me の金庫の情報を、確かめた形にしたもの */
export interface VaultInfo {
  userId: string
  kdfParams: KdfParams
  salt: Uint8Array
  recoverySalt: Uint8Array
  lockedUntil: number | null
  /** パスキーで開けるか(Dev Spec 17 章) */
  passkeys: PasskeyUnlockInfo
}

export type MeState = { userId: string; vault: null } | { userId: string; vault: VaultInfo }

function bytes(value: unknown): Uint8Array {
  const b = fromBase64(value)
  if (!b) throw new Error('サーバーの応答の形が違います')
  return b
}

/** /api/me のパスキーの情報を確かめる。形が違えば、パスキーは使えないものとする */
function parsePasskeyInfo(value: unknown): PasskeyUnlockInfo {
  const v = value as { state?: unknown; credentials?: unknown } | null | undefined
  if (v?.state === 'password_due') return { state: 'password_due' }
  if (v?.state === 'available' && Array.isArray(v.credentials)) {
    const credentials = v.credentials.filter(
      (c): c is { id: string; prfSalt: string } =>
        typeof c?.id === 'string' && fromBase64(c?.prfSalt)?.length === 32,
    )
    if (credentials.length > 0) return { state: 'available', credentials }
  }
  return { state: 'none' }
}

export async function fetchMe(): Promise<MeState> {
  const me = await api('GET', '/api/me', { parse: parseMe })
  if (!me.vault) return { userId: me.userId, vault: null }
  return {
    userId: me.userId,
    vault: {
      userId: me.userId,
      // 弱すぎる値を渡されたら、ここで例外になり、鍵を作らない(Dev Spec 3.5)
      kdfParams: parseKdfParams(me.vault.kdfParams),
      salt: bytes(me.vault.salt),
      recoverySalt: bytes(me.vault.recoverySalt),
      lockedUntil: me.vault.lockedUntil,
      passkeys: parsePasskeyInfo(me.vault.passkeys),
    },
  }
}

/** 作る途中の金庫。回復キーを控えたことを確かめてから、commitVault で送る(Dev Spec 5.1) */
export interface PreparedVault {
  userId: string
  recoveryKey: string
  request: CreateVaultRequest
  vaultKey: CryptoKey
}

/** 金庫を作る準備(鍵の生成と包む)。まだサーバーには送らない */
export async function prepareVault(userId: string, password: string): Promise<PreparedVault> {
  const salt = randomBytes(SALT_BYTES)
  const recoverySalt = randomBytes(SALT_BYTES)
  const recovery = generateRecoveryKey()
  const [pw, rk] = await Promise.all([
    derivePasswordKeys(password, salt, DEFAULT_KDF_PARAMS),
    deriveRecoveryKeys(recovery.bytes, recoverySalt),
  ])
  wipe(recovery.bytes)
  const extractable = await generateVaultKey()
  const request: CreateVaultRequest = {
    kdfParams: DEFAULT_KDF_PARAMS,
    salt: toBase64(salt),
    authToken: toBase64(pw.authToken),
    wrappedKey: toBase64(await wrapVaultKey(extractable, pw.wrapKey, userId)),
    recoverySalt: toBase64(recoverySalt),
    recoveryAuthToken: toBase64(rk.authToken),
    recoveryWrappedKey: toBase64(await wrapVaultKey(extractable, rk.wrapKey, userId)),
    settings: toBase64(await encryptJson(extractable, settingsAad(userId), DEFAULT_SETTINGS)),
  }
  wipe(pw.authToken, rk.authToken)
  // 取り出せる形の鍵は捨て、取り出せない形で持ち直す
  const vaultKey = await unwrapVaultKey(bytes(request.wrappedKey), pw.wrapKey, userId)
  return { userId, recoveryKey: recovery.text, request, vaultKey }
}

export async function commitVault(prepared: PreparedVault): Promise<OpenVault> {
  const { token } = await api('POST', '/api/vault', { parse: parseToken, body: prepared.request })
  return {
    userId: prepared.userId,
    token,
    vaultKey: prepared.vaultKey,
    settings: DEFAULT_SETTINGS,
    settingsVersion: 1,
    salt: bytes(prepared.request.salt),
    kdfParams: prepared.request.kdfParams,
    wrappedKey: bytes(prepared.request.wrappedKey),
  }
}

/**
 * 包んだ金庫の鍵を開き、設定を読んで、開いた金庫にする。
 * unwrapWith を渡せば、res.wrappedKey(マスターパスワードで包んだもの)ではなく、それを wrapKey で開く(パスキー)
 */
export async function openWith(
  userId: string,
  wrapKey: CryptoKey,
  password: { salt: Uint8Array; kdfParams: KdfParams },
  res: { token: string; wrappedKey: string; settings: string; settingsVersion: number },
  unwrapWith?: Uint8Array,
): Promise<OpenVault> {
  const wrappedKey = bytes(res.wrappedKey)
  const vaultKey = await unwrapVaultKey(unwrapWith ?? wrappedKey, wrapKey, userId)
  const settings = parseSettings(
    await decryptJson(vaultKey, settingsAad(userId), bytes(res.settings)),
  )
  return {
    userId,
    token: res.token,
    vaultKey,
    settings,
    settingsVersion: res.settingsVersion,
    ...password,
    wrappedKey,
  }
}

/** マスターパスワードで金庫を開ける(Dev Spec 5.2) */
export async function unlockVault(info: VaultInfo, password: string): Promise<OpenVault> {
  const keys = await derivePasswordKeys(password, info.salt, info.kdfParams)
  let res: UnlockResponse
  try {
    res = await api('POST', '/api/unlock', {
      parse: parseUnlock,
      body: { authToken: toBase64(keys.authToken) },
    })
  } finally {
    wipe(keys.authToken)
  }
  return openWith(info.userId, keys.wrapKey, info, res)
}

/** 回復キーで確かめた途中の状態。新しいマスターパスワードを決めたら finishRecovery を呼ぶ */
export interface RecoveryInProgress {
  userId: string
  token: string
  recoveryWrapKey: CryptoKey
  recoveryWrappedKey: Uint8Array
}

/** 回復キーを読めなければ null を返す(打ち間違い。サーバーには送らない) */
export async function startRecovery(
  info: VaultInfo,
  recoveryKeyText: string,
): Promise<RecoveryInProgress | null> {
  const rkBytes = parseRecoveryKey(recoveryKeyText)
  if (!rkBytes) return null
  const keys = await deriveRecoveryKeys(rkBytes, info.recoverySalt)
  wipe(rkBytes)
  let res: RecoverResponse
  try {
    res = await api('POST', '/api/recover', {
      parse: parseRecover,
      body: { recoveryAuthToken: toBase64(keys.authToken) },
    })
  } finally {
    wipe(keys.authToken)
  }
  return {
    userId: info.userId,
    token: res.token,
    recoveryWrapKey: keys.wrapKey,
    recoveryWrappedKey: bytes(res.recoveryWrappedKey),
  }
}

/** 新しいマスターパスワードで包み直して置き換える(Dev Spec 5.3)。ほかの端末のセッションは切れる */
export async function finishRecovery(
  r: RecoveryInProgress,
  newPassword: string,
): Promise<OpenVault> {
  const salt = randomBytes(SALT_BYTES)
  const keys = await derivePasswordKeys(newPassword, salt, DEFAULT_KDF_PARAMS)
  // 回復キーで包んだものから、取り出せる形で一時的に開き、新しい包む鍵で包み直す
  const extractable = await unwrapVaultKey(r.recoveryWrappedKey, r.recoveryWrapKey, r.userId, true)
  const wrappedKey = toBase64(await wrapVaultKey(extractable, keys.wrapKey, r.userId))
  const body: RecoverCompleteRequest = {
    kdfParams: DEFAULT_KDF_PARAMS,
    salt: toBase64(salt),
    authToken: toBase64(keys.authToken),
    wrappedKey,
  }
  let res: RecoverCompleteResponse
  try {
    res = await api('POST', '/api/recover/complete', {
      parse: parseRecoverComplete,
      body,
      token: r.token,
    })
  } finally {
    wipe(keys.authToken)
  }
  return openWith(
    r.userId,
    keys.wrapKey,
    { salt, kdfParams: DEFAULT_KDF_PARAMS },
    { ...res, wrappedKey },
  )
}

/** トークンを切る。失敗しても、画面の側では鍵を捨てて閉じる(呼ぶ側) */
// ---- 設定の画面(PRD 5.2・Dev Spec 8 章) ----

/** 設定を暗号にして保存する。ほかの端末で直されていれば ApiError(version_conflict) */
export async function saveSettings(vault: OpenVault, settings: Settings): Promise<OpenVault> {
  const body: UpdateSettingsRequest = {
    expectedVersion: vault.settingsVersion,
    settings: toBase64(await encryptJson(vault.vaultKey, settingsAad(vault.userId), settings)),
  }
  const { version } = await api('PUT', '/api/settings', {
    parse: parseVersion,
    body,
    token: vault.token,
  })
  return { ...vault, settings, settingsVersion: version }
}

/**
 * 今のマスターパスワードから合言葉を作り、包んだ金庫の鍵を、取り出せる形で開いてみる。
 * 開けなければ(今のマスターパスワードが違う)、合言葉だけをサーバーに送って失敗の回数に数えさせ、
 * サーバーの答え(403・429)を例外として投げる(Dev Spec 8 章「今の合言葉を求める操作も、失敗の回数に数える」)
 */
export async function confirmCurrent(
  vault: OpenVault,
  current: string,
  path: '/api/password' | '/api/recovery-key' | '/api/backup-keys' | '/api/passkeys',
): Promise<{ currentAuthToken: string; extractable: CryptoKey }> {
  const keys = await derivePasswordKeys(current, vault.salt, vault.kdfParams)
  const currentAuthToken = toBase64(keys.authToken)
  wipe(keys.authToken)
  try {
    const extractable = await unwrapVaultKey(vault.wrappedKey, keys.wrapKey, vault.userId, true)
    return { currentAuthToken, extractable }
  } catch {
    await api('POST', path, {
      body: { currentAuthToken } satisfies CurrentSecret,
      token: vault.token,
    })
    // 合言葉が合ったのに鍵を開けなかった(データが壊れている)。置き換えずに止める
    throw new Error('包んだ金庫の鍵を開けませんでした')
  }
}

/** マスターパスワードを変える。ほかの端末のセッションは切れる */
export async function changeMasterPassword(
  vault: OpenVault,
  current: string,
  next: string,
): Promise<OpenVault> {
  const { currentAuthToken, extractable } = await confirmCurrent(vault, current, '/api/password')
  const salt = randomBytes(SALT_BYTES)
  const keys = await derivePasswordKeys(next, salt, DEFAULT_KDF_PARAMS)
  const wrappedKey = await wrapVaultKey(extractable, keys.wrapKey, vault.userId)
  const body: ChangePasswordRequest = {
    currentAuthToken,
    kdfParams: DEFAULT_KDF_PARAMS,
    salt: toBase64(salt),
    authToken: toBase64(keys.authToken),
    wrappedKey: toBase64(wrappedKey),
  }
  wipe(keys.authToken)
  await api('POST', '/api/password', { body, token: vault.token })
  return { ...vault, salt, kdfParams: DEFAULT_KDF_PARAMS, wrappedKey }
}

/** 作り直す途中の回復キー。控えたことを確かめてから commitRecoveryKey で送る */
export interface PreparedRecoveryKey {
  recoveryKey: string
  request: ChangeRecoveryKeyRequest
}

/** 新しい回復キーを作り、金庫の鍵を包む。まだ送らない */
export async function prepareRecoveryKey(
  vault: OpenVault,
  current: string,
): Promise<PreparedRecoveryKey> {
  const { currentAuthToken, extractable } = await confirmCurrent(
    vault,
    current,
    '/api/recovery-key',
  )
  const recovery = generateRecoveryKey()
  const recoverySalt = randomBytes(SALT_BYTES)
  const rk = await deriveRecoveryKeys(recovery.bytes, recoverySalt)
  wipe(recovery.bytes)
  const request: ChangeRecoveryKeyRequest = {
    currentAuthToken,
    recoverySalt: toBase64(recoverySalt),
    recoveryAuthToken: toBase64(rk.authToken),
    recoveryWrappedKey: toBase64(await wrapVaultKey(extractable, rk.wrapKey, vault.userId)),
  }
  wipe(rk.authToken)
  return { recoveryKey: recovery.text, request }
}

export async function commitRecoveryKey(
  vault: OpenVault,
  prepared: PreparedRecoveryKey,
): Promise<void> {
  await api('POST', '/api/recovery-key', { body: prepared.request, token: vault.token })
}

/** 自分のデータをすべて消す。今のマスターパスワードが違えば ApiError(wrong_secret) */
export async function deleteAllData(vault: OpenVault, current: string): Promise<void> {
  const keys = await derivePasswordKeys(current, vault.salt, vault.kdfParams)
  const body: DeleteAllRequest = { currentAuthToken: toBase64(keys.authToken) }
  wipe(keys.authToken)
  await api('POST', '/api/delete-all', { body, token: vault.token })
}

export async function endSession(token: string): Promise<void> {
  await api('POST', '/api/lock', { token, keepalive: true }).catch(() => undefined)
}
