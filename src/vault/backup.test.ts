// バックアップの書き出し・読み込みのテスト(Dev Spec 14 章)。暗号は本物、サーバーは fetch の差し替えの偽物
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateVaultRequest } from '../shared/api-types.ts'
import { ApiError } from './api.ts'
import {
  BackupFormatError,
  BackupSecretError,
  createBackup,
  importBackup,
  openBackup,
  parseBackup,
  type BackupFile,
} from './backup.ts'
import { addEntry, loadEntries } from './entries.ts'
import type { Entry } from './entry.ts'
import { commitVault, prepareVault, type OpenVault } from './flows.ts'

const ALICE = 'a'.repeat(64)
const BOB = 'b'.repeat(64)
const PW = 'aoi-sora-hashiru-neko'
const PW_BOB = 'midori-umi-oyogu-inu'

type Row = { user: string; version: number; ciphertext: string }

/** 利用者ごとの金庫と、全員の件(ID は全員で 1 つの表。D1 と同じ) */
function fakeServer() {
  const vaults = new Map<string, CreateVaultRequest>()
  const rows = new Map<string, Row>()
  const tokens = new Map<string, string>()
  let limit = 2000
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const body = (init.body ? JSON.parse(init.body as string) : {}) as Record<string, string>
      const auth = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '')
      if (path === '/api/vault') {
        const user = body['__user']!
        vaults.set(user, body as unknown as CreateVaultRequest)
        const t = `t-${user}`
        tokens.set(t, user)
        return reply(201, { token: t })
      }
      const user = auth ? tokens.get(auth) : undefined
      if (!user) return reply(401, { error: 'invalid_session' })
      const v = vaults.get(user)!
      if (path === '/api/backup-keys') {
        if (body['currentAuthToken'] !== v.authToken) return reply(403, { error: 'wrong_secret' })
        return reply(200, {
          kdfParams: v.kdfParams,
          salt: v.salt,
          wrappedKey: v.wrappedKey,
          recoverySalt: v.recoverySalt,
          recoveryWrappedKey: v.recoveryWrappedKey,
        })
      }
      if (path === '/api/entries' && init.method === 'GET') {
        const entries = [...rows]
          .filter(([, r]) => r.user === user)
          .map(([id, r]) => ({ id, version: r.version, ciphertext: r.ciphertext }))
        return reply(200, { entries })
      }
      if (path === '/api/entries' && init.method === 'POST') {
        if (rows.has(body['id']!)) return reply(409, { error: 'entry_exists' })
        if ([...rows.values()].filter((r) => r.user === user).length >= limit) {
          return reply(409, { error: 'limit_reached' })
        }
        rows.set(body['id']!, { user, version: 1, ciphertext: body['ciphertext']! })
        return reply(201, { version: 1 })
      }
      return reply(404, { error: 'not_found' })
    }),
  )
  return {
    rows,
    setLimit: (n: number) => {
      limit = n
    },
  }
}

/** 金庫を作る。偽物のサーバーに、誰の金庫かを本文で伝える */
async function makeVault(user: string, password: string) {
  const prepared = await prepareVault(user, password)
  ;(prepared.request as unknown as Record<string, string>)['__user'] = user
  return { vault: await commitVault(prepared), recoveryKey: prepared.recoveryKey }
}

const draft = (serviceName: string): Omit<Entry, 'createdAt' | 'updatedAt'> => ({
  schema: 1,
  serviceName,
  password: `pw-${serviceName}`,
  tags: [],
})

let server: ReturnType<typeof fakeServer>
beforeEach(() => {
  server = fakeServer()
})
afterEach(() => vi.unstubAllGlobals())

async function aliceWithEntries(names: string[]) {
  const { vault, recoveryKey } = await makeVault(ALICE, PW)
  for (const n of names) await addEntry(vault, draft(n))
  return { vault, recoveryKey }
}

const ids = async (vault: OpenVault) => new Set((await loadEntries(vault)).items.map((i) => i.id))

describe('書き出す', () => {
  it('暗号のままの全件と包んだ鍵を入れ、マスターパスワードは入れない', async () => {
    const { vault } = await aliceWithEntries(['A', 'B'])
    const { file, text, filename } = await createBackup(vault, PW, new Date(2026, 10, 17, 9))
    expect(file.entries).toHaveLength(2)
    expect(file.userId).toBe(ALICE)
    expect(filename).toBe('account-manager-backup-2026-11-17.json')
    expect(text).not.toContain(PW)
    expect(text).not.toContain('pw-A')
    expect(
      parseBackup(text)
        .entries.map((e) => e.id)
        .sort(),
    ).toEqual(file.entries.map((e) => e.id).sort())
  })

  it('今のマスターパスワードが違えば、サーバーに合言葉だけを送って 403(回数に数える)', async () => {
    const { vault } = await aliceWithEntries(['A'])
    await expect(createBackup(vault, 'chigau-password-desu')).rejects.toMatchObject({
      code: 'wrong_secret',
    })
  })
})

describe('開く', () => {
  it('書き出したときのマスターパスワードでも、復旧キーでも開ける。違えば BackupSecretError', async () => {
    const { vault, recoveryKey } = await aliceWithEntries(['A'])
    const { file } = await createBackup(vault, PW)
    await expect(openBackup(file, { kind: 'password', text: PW })).resolves.toBeTruthy()
    await expect(openBackup(file, { kind: 'recovery', text: recoveryKey })).resolves.toBeTruthy()
    await expect(openBackup(file, { kind: 'password', text: PW_BOB })).rejects.toBeInstanceOf(
      BackupSecretError,
    )
    await expect(openBackup(file, { kind: 'recovery', text: 'abcd' })).rejects.toBeInstanceOf(
      BackupSecretError,
    )
  })

  it('userId を書き換えたファイルは開けない(AAD に入っているため)', async () => {
    const { vault } = await aliceWithEntries(['A'])
    const { file } = await createBackup(vault, PW)
    await expect(
      openBackup({ ...file, userId: BOB }, { kind: 'password', text: PW }),
    ).rejects.toBeInstanceOf(BackupSecretError)
  })
})

describe('ファイルの形の確かめ', () => {
  it('バックアップでないもの・壊れたものは BackupFormatError', async () => {
    const { vault } = await aliceWithEntries(['A'])
    const { file } = await createBackup(vault, PW)
    const bad = (patch: Partial<Record<keyof BackupFile, unknown>>) =>
      expect(() => parseBackup(JSON.stringify({ ...file, ...patch }))).toThrow(BackupFormatError)
    expect(() => parseBackup('not json')).toThrow(BackupFormatError)
    bad({ format: 'other' })
    bad({ version: 2 })
    bad({ kdfParams: { alg: 'argon2id', m: 1, t: 1, p: 1 } })
    bad({ salt: 'AAAA' })
    bad({ entries: [{ id: 'x', ciphertext: file.entries[0]!.ciphertext }] })
    bad({ entries: [file.entries[0], file.entries[0]] })
  })
})

describe('読み込む', () => {
  it('消してしまった件を戻す。今ある件は残し、作った日・更新した日はファイルのまま', async () => {
    const { vault } = await aliceWithEntries(['A', 'B'])
    const before = await loadEntries(vault)
    const { file } = await createBackup(vault, PW)
    const lost = before.items.find((i) => i.entry.serviceName === 'B')!
    server.rows.delete(lost.id)

    const key = await openBackup(file, { kind: 'password', text: PW })
    const result = await importBackup(vault, file, key, await ids(vault))
    expect(result).toEqual({ added: 1, skipped: 1, unreadable: 0, stoppedAtLimit: false })
    const after = await loadEntries(vault)
    const restored = after.items.find((i) => i.entry.serviceName === 'B')!
    expect(restored.id).toBe(lost.id)
    expect(restored.entry).toEqual(lost.entry)
  })

  it('何度読み込んでも、今のデータを壊さない(すべて飛ばす)', async () => {
    const { vault } = await aliceWithEntries(['A', 'B'])
    const { file } = await createBackup(vault, PW)
    const key = await openBackup(file, { kind: 'password', text: PW })
    const result = await importBackup(vault, file, key, await ids(vault))
    expect(result).toEqual({ added: 0, skipped: 2, unreadable: 0, stoppedAtLimit: false })
    expect((await loadEntries(vault)).items).toHaveLength(2)
  })

  it('別の人の管理画面にも読み込める。ID がぶつかったら新しい ID で足す', async () => {
    const alice = await aliceWithEntries(['A', 'B'])
    const { file } = await createBackup(alice.vault, PW)
    const bob = await makeVault(BOB, PW_BOB)
    const key = await openBackup(file, { kind: 'password', text: PW })
    const result = await importBackup(bob.vault, file, key, await ids(bob.vault))
    expect(result.added).toBe(2)
    const items = (await loadEntries(bob.vault)).items
    expect(items.map((i) => i.entry.serviceName).sort()).toEqual(['A', 'B'])
    expect(items.every((i) => !file.entries.some((e) => e.id === i.id))).toBe(true)
    // アリスの件はそのまま
    expect((await loadEntries(alice.vault)).items).toHaveLength(2)
  })

  it('復号できない件は数えて飛ばす。上限に達したら止める', async () => {
    const { vault } = await aliceWithEntries(['A', 'B', 'C'])
    const { file } = await createBackup(vault, PW)
    const key = await openBackup(file, { kind: 'password', text: PW })
    const broken: BackupFile = {
      ...file,
      entries: [
        { ...file.entries[0]!, ciphertext: file.entries[1]!.ciphertext },
        ...file.entries.slice(1),
      ],
    }
    server.rows.clear()
    server.setLimit(1)
    const result = await importBackup(vault, broken, key, new Set())
    expect(result.unreadable).toBe(1)
    expect(result.added).toBe(1)
    expect(result.stoppedAtLimit).toBe(true)
  })

  it('セッションが切れていたら ApiError を投げる', async () => {
    const { vault } = await aliceWithEntries(['A'])
    const { file } = await createBackup(vault, PW)
    const key = await openBackup(file, { kind: 'password', text: PW })
    server.rows.clear()
    await expect(
      importBackup({ ...vault, token: 'expired' }, file, key, new Set()),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
