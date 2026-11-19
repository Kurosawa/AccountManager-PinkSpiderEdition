// 暗号のままのバックアップの書き出し・読み込み(PRD 6 章フェーズ 2・Dev Spec 14 章・discussion26)。
// ファイルには、暗号のままの全件と、それを開くための包んだ鍵・塩・鍵の作り方の値だけを入れる。
// マスターパスワードも、そこから作った鍵も入れない。サーバーの PEPPER が無くても、マスターパスワードか復旧キーで開ける
import { wipe } from '../crypto/bytes.ts'
import { IV_BYTES, derivePasswordKeys, deriveRecoveryKeys, unwrapVaultKey } from '../crypto/keys.ts'
import { decryptJson, entryAad } from '../crypto/record.ts'
import { parseRecoveryKey } from '../crypto/recovery-key.ts'
import {
  ENTRY_ID_PATTERN,
  MAX_ENTRIES,
  MAX_ENTRY_BYTES,
  SALT_BYTES,
  WRAPPED_KEY_BYTES,
  type CurrentSecret,
} from '../shared/api-types.ts'
import { fromBase64 } from '../shared/base64.ts'
import { parseKdfParams, type KdfParams } from '../shared/kdf-params.ts'
import { api, ApiError } from './api.ts'
import { parseBackupKeys, parseListEntries } from './responses.ts'
import { putNewEntry } from './entries.ts'
import { localDate, parseEntry } from './entry.ts'
import { confirmCurrent, type OpenVault } from './flows.ts'

export const BACKUP_FORMAT = 'account-manager-backup'
export const BACKUP_VERSION = 1
/** 読み込むファイルの大きさの上限(全件が上限の大きさでも収まる値) */
export const MAX_BACKUP_FILE_BYTES = MAX_ENTRIES * MAX_ENTRY_BYTES * 2

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  /** 書き出した日時(ISO 8601) */
  exportedAt: string
  /** 書き出した人の利用者の ID。暗号の AAD に入っているので、開くときに要る */
  userId: string
  kdfParams: KdfParams
  salt: string
  wrappedKey: string
  recoverySalt: string
  recoveryWrappedKey: string
  entries: Array<{ id: string; ciphertext: string }>
}

/** ファイルの形が違う(バックアップのファイルではない・壊れている) */
export class BackupFormatError extends Error {}
/** マスターパスワード・復旧キーが、このファイルに合わない */
export class BackupSecretError extends Error {}

/**
 * 書き出す。今のマスターパスワードを確かめ(違えば失敗の回数に数える)、
 * サーバーから包んだ鍵と暗号のままの全件を受け取って、1 つのファイルの中身にする
 */
export async function createBackup(
  vault: OpenVault,
  current: string,
  now = new Date(),
): Promise<{ file: BackupFile; text: string; filename: string }> {
  const { currentAuthToken } = await confirmCurrent(vault, current, '/api/backup-keys')
  const keys = await api('POST', '/api/backup-keys', {
    parse: parseBackupKeys,
    body: { currentAuthToken } satisfies CurrentSecret,
    token: vault.token,
  })
  const { entries } = await api('GET', '/api/entries', {
    parse: parseListEntries,
    token: vault.token,
  })
  const exportedAt = now.toISOString()
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    userId: vault.userId,
    kdfParams: parseKdfParams(keys.kdfParams),
    salt: keys.salt,
    wrappedKey: keys.wrappedKey,
    recoverySalt: keys.recoverySalt,
    recoveryWrappedKey: keys.recoveryWrappedKey,
    entries: entries.map((e) => ({ id: e.id, ciphertext: e.ciphertext })),
  }
  // 読み込めない形のファイルを渡さないよう、書き出す前に同じ確かめを通す
  parseBackup(JSON.stringify(file))
  return {
    file,
    text: JSON.stringify(file, null, 2),
    filename: `account-manager-backup-${localDate(exportedAt) ?? 'unknown'}.json`,
  }
}

function bytesOf(value: unknown, length: number): boolean {
  const b = fromBase64(value)
  return b !== null && b.length === length
}

/** ファイルの中身を確かめる。形が違えば BackupFormatError */
export function parseBackup(text: string): BackupFile {
  let v: Record<string, unknown>
  try {
    v = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new BackupFormatError('JSON ではありません')
  }
  if (!v || typeof v !== 'object' || v['format'] !== BACKUP_FORMAT) {
    throw new BackupFormatError('AccountManager のバックアップではありません')
  }
  if (v['version'] !== BACKUP_VERSION) throw new BackupFormatError('知らない版です')
  const userId = v['userId']
  const exportedAt = v['exportedAt']
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 128) {
    throw new BackupFormatError('userId の形が違います')
  }
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    throw new BackupFormatError('exportedAt の形が違います')
  }
  let kdfParams: KdfParams
  try {
    kdfParams = parseKdfParams(v['kdfParams'])
  } catch {
    throw new BackupFormatError('kdfParams が受け付ける範囲の外です')
  }
  if (
    !bytesOf(v['salt'], SALT_BYTES) ||
    !bytesOf(v['recoverySalt'], SALT_BYTES) ||
    !bytesOf(v['wrappedKey'], WRAPPED_KEY_BYTES) ||
    !bytesOf(v['recoveryWrappedKey'], WRAPPED_KEY_BYTES)
  ) {
    throw new BackupFormatError('鍵の形が違います')
  }
  const list = v['entries']
  if (!Array.isArray(list) || list.length > MAX_ENTRIES) {
    throw new BackupFormatError('entries の形が違います')
  }
  const seen = new Set<string>()
  const entries = list.map((e: unknown) => {
    const r = (e ?? {}) as Record<string, unknown>
    const id = r['id']
    const ct = fromBase64(r['ciphertext'])
    if (typeof id !== 'string' || !ENTRY_ID_PATTERN.test(id) || seen.has(id)) {
      throw new BackupFormatError('件の ID の形が違います')
    }
    if (!ct || ct.length <= IV_BYTES || ct.length > MAX_ENTRY_BYTES) {
      throw new BackupFormatError('件の暗号の形が違います')
    }
    seen.add(id)
    return { id, ciphertext: r['ciphertext'] as string }
  })
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    userId,
    kdfParams,
    salt: v['salt'] as string,
    wrappedKey: v['wrappedKey'] as string,
    recoverySalt: v['recoverySalt'] as string,
    recoveryWrappedKey: v['recoveryWrappedKey'] as string,
    entries,
  }
}

export type BackupSecret = { kind: 'password'; text: string } | { kind: 'recovery'; text: string }

/**
 * ファイルの金庫の鍵を開く(ブラウザの中だけ。サーバーには何も送らない)。
 * 書き出したときのマスターパスワードか、そのときの復旧キーが要る。合わなければ BackupSecretError
 */
export async function openBackup(file: BackupFile, secret: BackupSecret): Promise<CryptoKey> {
  let wrapKey: CryptoKey
  let wrapped: Uint8Array
  if (secret.kind === 'password') {
    const keys = await derivePasswordKeys(secret.text, fromBase64(file.salt)!, file.kdfParams)
    wipe(keys.authToken)
    wrapKey = keys.wrapKey
    wrapped = fromBase64(file.wrappedKey)!
  } else {
    const bytes = parseRecoveryKey(secret.text)
    if (!bytes) throw new BackupSecretError('復旧キーの形が違います')
    const keys = await deriveRecoveryKeys(bytes, fromBase64(file.recoverySalt)!)
    wipe(bytes, keys.authToken)
    wrapKey = keys.wrapKey
    wrapped = fromBase64(file.recoveryWrappedKey)!
  }
  try {
    return await unwrapVaultKey(wrapped, wrapKey, file.userId)
  } catch {
    throw new BackupSecretError('このファイルを開けませんでした')
  }
}

export interface ImportResult {
  /** 足した件 */
  added: number
  /** 同じ件(同じ ID)が今の管理画面にあったので、今のものを残した件 */
  skipped: number
  /** ファイルの中で、復号できなかった件 */
  unreadable: number
  /** 登録できる件数の上限に達して、途中で止めたか */
  stoppedAtLimit: boolean
}

/**
 * 読み込む。ファイルの各件を復号し、今の管理画面の鍵で暗号にし直して足す(discussion26 の 3: 今のものを残し、無い件だけ足す)。
 * 作った日・更新した日は、ファイルのままにする。ほかの人の件と ID がぶつかったら、新しい ID で足す
 */
export async function importBackup(
  vault: OpenVault,
  file: BackupFile,
  backupKey: CryptoKey,
  existingIds: ReadonlySet<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, skipped: 0, unreadable: 0, stoppedAtLimit: false }
  const total = file.entries.length
  for (const [i, r] of file.entries.entries()) {
    onProgress?.(i, total)
    if (existingIds.has(r.id)) {
      result.skipped++
      continue
    }
    let entry
    try {
      entry = parseEntry(
        await decryptJson(backupKey, entryAad(file.userId, r.id), fromBase64(r.ciphertext)!),
      )
    } catch {
      entry = null
    }
    if (!entry) {
      result.unreadable++
      continue
    }
    try {
      try {
        await putNewEntry(vault, r.id, entry)
      } catch (e) {
        // 今の管理画面には無いのに同じ ID がある = ほかの人の件。新しい ID で足す
        if (e instanceof ApiError && e.code === 'entry_exists') {
          await putNewEntry(vault, crypto.randomUUID(), entry)
        } else {
          throw e
        }
      }
      result.added++
    } catch (e) {
      if (e instanceof ApiError && e.code === 'limit_reached') {
        result.stoppedAtLimit = true
        break
      }
      throw e
    }
  }
  onProgress?.(total, total)
  return result
}

/** 書き出したファイルを、端末に保存させる */
export function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
