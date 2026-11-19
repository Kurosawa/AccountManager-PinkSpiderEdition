// 暗号の部品のテスト(Dev Spec 10 章のステップ 2: 往復できる・違うパスワードで開かない・AAD の入れ替えで開かない)
import { beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from './bytes.ts'
import { DEFAULT_KDF_PARAMS, deriveMasterKey, parseKdfParams, SALT_BYTES } from './kdf.ts'
import {
  derivePasswordKeys,
  deriveRecoveryKeys,
  generateVaultKey,
  rewrapVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
  type DerivedKeys,
} from './keys.ts'
import { decryptJson, encryptJson, entryAad, settingsAad } from './record.ts'
import {
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  recoveryKeyTail,
} from './recovery-key.ts'

const USER = 'u'.repeat(64)
const OTHER_USER = 'v'.repeat(64)
const PASSWORD = 'aoi-sora-hashiru-neko'
const salt = randomBytes(SALT_BYTES)

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

// Web Crypto の失敗の種類。AES-GCM の認証に落ちると OperationError、取り出せない鍵を取り出すと InvalidAccessError
const AUTH_FAILED = expect.objectContaining({ name: 'OperationError' })
const NOT_EXTRACTABLE = expect.objectContaining({ name: 'InvalidAccessError' })

// Argon2id は 1 回ごとに時間がかかるので、使い回す
let keys: DerivedKeys
beforeAll(async () => {
  keys = await derivePasswordKeys(PASSWORD, salt, DEFAULT_KDF_PARAMS)
})

describe('Argon2id(親の鍵)', () => {
  it('同じパスワードと salt なら同じ鍵、どちらかが違えば違う鍵になる', async () => {
    const a = await deriveMasterKey(PASSWORD, salt, DEFAULT_KDF_PARAMS)
    const b = await deriveMasterKey(PASSWORD, salt, DEFAULT_KDF_PARAMS)
    const c = await deriveMasterKey(PASSWORD + '!', salt, DEFAULT_KDF_PARAMS)
    const d = await deriveMasterKey(PASSWORD, randomBytes(SALT_BYTES), DEFAULT_KDF_PARAMS)
    expect(a).toHaveLength(32)
    expect(hex(a)).toBe(hex(b))
    expect(hex(a)).not.toBe(hex(c))
    expect(hex(a)).not.toBe(hex(d))
  })

  it('見た目が同じパスワードは、Unicode の表し方が違っても同じ鍵になる(NFC にそろえる)', async () => {
    const nfc = 'がぎぐげご-パスワード'.normalize('NFC')
    const nfd = nfc.normalize('NFD')
    expect(nfc).not.toBe(nfd)
    const a = await deriveMasterKey(nfc, salt, DEFAULT_KDF_PARAMS)
    const b = await deriveMasterKey(nfd, salt, DEFAULT_KDF_PARAMS)
    expect(hex(a)).toBe(hex(b))
  })

  it('弱すぎる・大きすぎる kdf_params は受け付けない(サーバーから弱い値を渡されても使わない)', () => {
    expect(parseKdfParams(DEFAULT_KDF_PARAMS)).toEqual(DEFAULT_KDF_PARAMS)
    for (const bad of [
      null,
      'argon2id',
      { ...DEFAULT_KDF_PARAMS, alg: 'pbkdf2' },
      { ...DEFAULT_KDF_PARAMS, m: 1024 },
      { ...DEFAULT_KDF_PARAMS, m: 4_194_304 },
      { ...DEFAULT_KDF_PARAMS, t: 1 },
      { ...DEFAULT_KDF_PARAMS, t: 100 },
      { ...DEFAULT_KDF_PARAMS, p: 0 },
      { ...DEFAULT_KDF_PARAMS, m: 65536.5 },
      { ...DEFAULT_KDF_PARAMS, m: '65536' },
    ]) {
      expect(() => parseKdfParams(bad)).toThrow('受け付ける範囲の外')
    }
  })

  it('salt の長さが違えば鍵を作らない', async () => {
    await expect(deriveMasterKey(PASSWORD, randomBytes(8), DEFAULT_KDF_PARAMS)).rejects.toThrow(
      'salt の長さ',
    )
  })
})

describe('包む鍵と合言葉', () => {
  it('合言葉は 32 バイトで、同じパスワードなら同じ値になる', async () => {
    const again = await derivePasswordKeys(PASSWORD, salt, DEFAULT_KDF_PARAMS)
    expect(keys.authToken).toHaveLength(32)
    expect(hex(again.authToken)).toBe(hex(keys.authToken))
  })

  it('包む鍵は取り出せない', async () => {
    expect(keys.wrapKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', keys.wrapKey)).rejects.toThrow(NOT_EXTRACTABLE)
  })

  it('合言葉(サーバーが知る値)は、包む鍵とも親の鍵とも違う', async () => {
    const master = await deriveMasterKey(PASSWORD, salt, DEFAULT_KDF_PARAMS)
    expect(hex(keys.authToken)).not.toBe(hex(master))
    // 包む鍵を合言葉と同じバイト列から作ったものと比べ、別の鍵であることを確かめる
    const fake = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(keys.authToken),
      'AES-GCM',
      false,
      ['wrapKey', 'unwrapKey'],
    )
    const vaultKey = await generateVaultKey()
    const wrapped = await wrapVaultKey(vaultKey, keys.wrapKey, USER)
    await expect(unwrapVaultKey(wrapped, fake, USER)).rejects.toThrow(AUTH_FAILED)
  })
})

describe('金庫の鍵を包む・開く', () => {
  it('往復でき、開いた鍵は取り出せない', async () => {
    const vaultKey = await generateVaultKey()
    const wrapped = await wrapVaultKey(vaultKey, keys.wrapKey, USER)
    const opened = await unwrapVaultKey(wrapped, keys.wrapKey, USER)
    expect(opened.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', opened)).rejects.toThrow(NOT_EXTRACTABLE)
    // 元の鍵で暗号にしたものを、開いた鍵で戻せる
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), { a: 1 })
    expect(await decryptJson(opened, entryAad(USER, 'e1'), ct)).toEqual({ a: 1 })
  })

  it('違うパスワードの包む鍵では開かない', async () => {
    const wrapped = await wrapVaultKey(await generateVaultKey(), keys.wrapKey, USER)
    const wrong = await derivePasswordKeys(PASSWORD + 'x', salt, DEFAULT_KDF_PARAMS)
    await expect(unwrapVaultKey(wrapped, wrong.wrapKey, USER)).rejects.toThrow(AUTH_FAILED)
  })

  it('ほかの利用者の行と入れ替えられたら開かない(AAD に利用者の ID)', async () => {
    const wrapped = await wrapVaultKey(await generateVaultKey(), keys.wrapKey, USER)
    await expect(unwrapVaultKey(wrapped, keys.wrapKey, OTHER_USER)).rejects.toThrow(AUTH_FAILED)
  })

  it('1 バイトでも書き換えられたら開かない', async () => {
    const wrapped = await wrapVaultKey(await generateVaultKey(), keys.wrapKey, USER)
    for (const i of [0, 12, wrapped.length - 1]) {
      const bad = wrapped.slice()
      bad[i]! ^= 1
      await expect(unwrapVaultKey(bad, keys.wrapKey, USER)).rejects.toThrow(AUTH_FAILED)
    }
    await expect(unwrapVaultKey(wrapped.slice(0, 12), keys.wrapKey, USER)).rejects.toThrow(
      '包んだ鍵の長さ',
    )
  })

  it('同じ鍵を 2 回包むと、IV が違うので別の値になる', async () => {
    const vaultKey = await generateVaultKey()
    const a = await wrapVaultKey(vaultKey, keys.wrapKey, USER)
    const b = await wrapVaultKey(vaultKey, keys.wrapKey, USER)
    expect(hex(a)).not.toBe(hex(b))
  })

  it('マスターパスワードを変えたら、包み直すだけで前のデータを読める', async () => {
    const vaultKey = await generateVaultKey()
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), { serviceName: 'A' })
    const wrapped = await wrapVaultKey(vaultKey, keys.wrapKey, USER)

    const newSalt = randomBytes(SALT_BYTES)
    const next = await derivePasswordKeys('新しい-マスター-パスワード', newSalt, DEFAULT_KDF_PARAMS)
    const rewrapped = await rewrapVaultKey(wrapped, keys.wrapKey, next.wrapKey, USER)

    const opened = await unwrapVaultKey(rewrapped, next.wrapKey, USER)
    expect(opened.extractable).toBe(false)
    expect(await decryptJson(opened, entryAad(USER, 'e1'), ct)).toEqual({ serviceName: 'A' })
    await expect(unwrapVaultKey(rewrapped, keys.wrapKey, USER)).rejects.toThrow(AUTH_FAILED)
  })
})

describe('1 件と設定の暗号', () => {
  let vaultKey: CryptoKey
  beforeAll(async () => {
    vaultKey = await unwrapVaultKey(
      await wrapVaultKey(await generateVaultKey(), keys.wrapKey, USER),
      keys.wrapKey,
      USER,
    )
  })

  const entry = {
    schema: 1,
    serviceName: 'サンプル',
    password: 'p@ss-🔑',
    tags: ['仕事'],
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
  }

  it('往復できる(日本語・絵文字を含む)', async () => {
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), entry)
    expect(await decryptJson(vaultKey, entryAad(USER, 'e1'), ct)).toEqual(entry)
    const s = await encryptJson(vaultKey, settingsAad(USER), { autoLockMinutes: 5 })
    expect(await decryptJson(vaultKey, settingsAad(USER), s)).toEqual({ autoLockMinutes: 5 })
  })

  it('暗号に中身がそのまま見えない', async () => {
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), entry)
    expect(new TextDecoder().decode(ct)).not.toContain('サンプル')
  })

  it('ほかの件・ほかの人・設定と入れ替えられたら開かない(AAD)', async () => {
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), entry)
    await expect(decryptJson(vaultKey, entryAad(USER, 'e2'), ct)).rejects.toThrow(AUTH_FAILED)
    await expect(decryptJson(vaultKey, entryAad(OTHER_USER, 'e1'), ct)).rejects.toThrow(AUTH_FAILED)
    await expect(decryptJson(vaultKey, settingsAad(USER), ct)).rejects.toThrow(AUTH_FAILED)
  })

  it('違う金庫の鍵では開かない', async () => {
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), entry)
    await expect(decryptJson(await generateVaultKey(), entryAad(USER, 'e1'), ct)).rejects.toThrow(
      AUTH_FAILED,
    )
  })

  it('書き換えられた暗号は開かない', async () => {
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), entry)
    const bad = ct.slice()
    bad[bad.length - 1]! ^= 1
    await expect(decryptJson(vaultKey, entryAad(USER, 'e1'), bad)).rejects.toThrow(AUTH_FAILED)
  })

  it('同じ中身でも、毎回違う暗号になる(IV が毎回ランダム)', async () => {
    const a = await encryptJson(vaultKey, entryAad(USER, 'e1'), entry)
    const b = await encryptJson(vaultKey, entryAad(USER, 'e1'), entry)
    expect(hex(a.slice(0, 12))).not.toBe(hex(b.slice(0, 12)))
    expect(hex(a)).not.toBe(hex(b))
  })
})

describe('回復キー', () => {
  it('32 文字を 4 文字ずつ区切った形で、読み違えやすい文字を使わない', () => {
    const { text } = generateRecoveryKey()
    expect(text).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/)
    expect(recoveryKeyTail(text)).toBe(text.slice(-4))
  })

  it('見せた形から元のバイト列に戻せる(小文字・空白・O と 0・I と 1 の読み違えも受け付ける)', () => {
    const { bytes, text } = generateRecoveryKey()
    expect(hex(parseRecoveryKey(text)!)).toBe(hex(bytes))
    const sloppy = ` ${text.toLowerCase().replace(/-/g, ' ')} `
    expect(hex(parseRecoveryKey(sloppy)!)).toBe(hex(bytes))
    const zeros = formatRecoveryKey(new Uint8Array(20))
    expect(zeros).toBe('0000-0000-0000-0000-0000-0000-0000-0000')
    expect(parseRecoveryKey('OOOO-oooo-0000-0000-0000-0000-0000-0000')).toEqual(new Uint8Array(20))
    // 0x08 が並ぶと、5 ビットずつ区切ったときに「1」が出る
    const withOnes = formatRecoveryKey(new Uint8Array(20).fill(0x08))
    expect(withOnes).toContain('1')
    const expected = new Uint8Array(20).fill(0x08)
    expect(parseRecoveryKey(withOnes.replace(/1/g, 'l'))).toEqual(expected)
    expect(parseRecoveryKey(withOnes.replace(/1/g, 'I'))).toEqual(expected)
  })

  it('長さが違う・使わない文字があるものは読まない', () => {
    const { text } = generateRecoveryKey()
    expect(parseRecoveryKey(text.slice(0, -1))).toBeNull()
    expect(parseRecoveryKey(text + 'A')).toBeNull()
    expect(parseRecoveryKey('U' + text.slice(1))).toBeNull()
    expect(parseRecoveryKey('')).toBeNull()
  })

  it('回復キーで包んだ金庫の鍵を開け、マスターパスワードで包んだものと同じ鍵が取り出せる', async () => {
    const vaultKey = await generateVaultKey()
    const ct = await encryptJson(vaultKey, entryAad(USER, 'e1'), { a: 1 })
    const rk = generateRecoveryKey()
    const rkSalt = randomBytes(SALT_BYTES)
    const rkKeys = await deriveRecoveryKeys(rk.bytes, rkSalt)
    const wrapped = await wrapVaultKey(vaultKey, rkKeys.wrapKey, USER)

    // 打ち込まれた控えから作り直す
    const again = await deriveRecoveryKeys(parseRecoveryKey(rk.text)!, rkSalt)
    expect(hex(again.authToken)).toBe(hex(rkKeys.authToken))
    const opened = await unwrapVaultKey(wrapped, again.wrapKey, USER)
    expect(await decryptJson(opened, entryAad(USER, 'e1'), ct)).toEqual({ a: 1 })
  })

  it('違う回復キー・違う回復の salt では開かない。合言葉もマスターパスワードのものと違う', async () => {
    const rk = generateRecoveryKey()
    const rkSalt = randomBytes(SALT_BYTES)
    const rkKeys = await deriveRecoveryKeys(rk.bytes, rkSalt)
    const wrapped = await wrapVaultKey(await generateVaultKey(), rkKeys.wrapKey, USER)

    const otherKey = await deriveRecoveryKeys(generateRecoveryKey().bytes, rkSalt)
    await expect(unwrapVaultKey(wrapped, otherKey.wrapKey, USER)).rejects.toThrow(AUTH_FAILED)
    const otherSalt = await deriveRecoveryKeys(rk.bytes, randomBytes(SALT_BYTES))
    await expect(unwrapVaultKey(wrapped, otherSalt.wrapKey, USER)).rejects.toThrow(AUTH_FAILED)
    expect(hex(rkKeys.authToken)).not.toBe(hex(keys.authToken))
  })

  it('長さの違う回復キーでは鍵を作らない', async () => {
    await expect(deriveRecoveryKeys(randomBytes(16), randomBytes(SALT_BYTES))).rejects.toThrow(
      '回復キーの長さ',
    )
  })
})
