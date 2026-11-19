// 1 件の読み書き。ブラウザで暗号にしてから送り、受け取ったら復号する(Dev Spec 3.3・8 章)
import { decryptJson, encryptJson, entryAad } from '../crypto/record.ts'
import type {
  CreateEntryRequest,
  DeleteEntryRequest,
  UpdateEntryRequest,
} from '../shared/api-types.ts'
import { fromBase64, toBase64 } from '../shared/base64.ts'
import { api } from './api.ts'
import { parseListEntries, parseVersion } from './responses.ts'
import { parseEntry, type Entry } from './entry.ts'
import type { OpenVault } from './flows.ts'

/** 画面で扱う 1 件(復号したもの) */
export interface Item {
  id: string
  version: number
  entry: Entry
}

export interface LoadedEntries {
  items: Item[]
  /** 復号できなかった件の数(鍵が違う・入れ替えられた・壊れた) */
  unreadable: number
}

/** 全件を受け取って復号する */
export async function loadEntries(vault: OpenVault): Promise<LoadedEntries> {
  const { entries } = await api('GET', '/api/entries', {
    parse: parseListEntries,
    token: vault.token,
  })
  const results = await Promise.all(
    entries.map(async (r): Promise<Item | null> => {
      try {
        const data = fromBase64(r.ciphertext)
        if (!data) return null
        const entry = parseEntry(
          await decryptJson(vault.vaultKey, entryAad(vault.userId, r.id), data),
        )
        return entry ? { id: r.id, version: r.version, entry } : null
      } catch {
        return null
      }
    }),
  )
  const items = results.filter((x): x is Item => x !== null)
  return { items, unreadable: results.length - items.length }
}

async function seal(vault: OpenVault, id: string, entry: Entry): Promise<string> {
  return toBase64(await encryptJson(vault.vaultKey, entryAad(vault.userId, id), entry))
}

/**
 * 決まった ID と中身のまま 1 件を足す(バックアップの読み込み。Dev Spec 14 章)。
 * 同じ ID が既にあれば ApiError(entry_exists)、上限なら ApiError(limit_reached)
 */
export async function putNewEntry(vault: OpenVault, id: string, entry: Entry): Promise<Item> {
  const body: CreateEntryRequest = { id, ciphertext: await seal(vault, id, entry) }
  const { version } = await api('POST', '/api/entries', {
    parse: parseVersion,
    body,
    token: vault.token,
  })
  return { id, version, entry }
}

/** 新しい 1 件を足す。作成・更新の時刻はここで入れる */
export async function addEntry(
  vault: OpenVault,
  draft: Omit<Entry, 'createdAt' | 'updatedAt'>,
): Promise<Item> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const entry: Entry = { ...draft, createdAt: now, updatedAt: now }
  const body: CreateEntryRequest = { id, ciphertext: await seal(vault, id, entry) }
  const { version } = await api('POST', '/api/entries', {
    parse: parseVersion,
    body,
    token: vault.token,
  })
  return { id, version, entry }
}

/** 1 件を直す。ほかの端末で更新されていれば ApiError(version_conflict) */
export async function updateEntry(
  vault: OpenVault,
  item: Item,
  draft: Omit<Entry, 'createdAt' | 'updatedAt'>,
): Promise<Item> {
  const entry: Entry = {
    ...draft,
    createdAt: item.entry.createdAt,
    updatedAt: new Date().toISOString(),
  }
  const body: UpdateEntryRequest = {
    expectedVersion: item.version,
    ciphertext: await seal(vault, item.id, entry),
  }
  const { version } = await api('PUT', `/api/entries/${item.id}`, {
    parse: parseVersion,
    body,
    token: vault.token,
  })
  return { id: item.id, version, entry }
}

/** 1 件を消す。ほかの端末で更新されていれば ApiError(version_conflict) */
export async function deleteEntry(vault: OpenVault, item: Item): Promise<void> {
  const body: DeleteEntryRequest = { expectedVersion: item.version }
  await api('DELETE', `/api/entries/${item.id}`, { body, token: vault.token })
}
