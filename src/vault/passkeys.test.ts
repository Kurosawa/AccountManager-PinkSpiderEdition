// パスキーの登録の流れのテスト(Dev Spec 17 章)。WebAuthn は偽物に差し替える(本物の端末での確かめは discussion38 の 5)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { derivePasskeyKeys, generateVaultKey, unwrapVaultKey } from '../crypto/keys.ts'
import { decryptJson, encryptJson, passkeyNameAad, settingsAad } from '../crypto/record.ts'
import { DEFAULT_KDF_PARAMS } from '../shared/kdf-params.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import type { AddPasskeyRequest } from '../shared/api-types.ts'
import { fromBase64 } from '../shared/base64.ts'
import * as apiModule from './api.ts'
import { ApiError } from './api.ts'
import * as flows from './flows.ts'
import type { OpenVault, VaultInfo } from './flows.ts'
import {
  fromBase64Url,
  listPasskeys,
  PasskeyCancelledError,
  PasskeyExistsError,
  passkeysHere,
  PasskeyUnsupportedError,
  registerPasskey,
  toBase64Url,
  unlockWithPasskey,
} from './passkeys.ts'

const USER = 'a'.repeat(64)
let vault: OpenVault
const RAW_ID = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 250, 251])

/** 偽のパスキー。PRF の値は salt から決まる(同じ salt なら同じ値) */
function fakeAuthenticator(
  opts: { atCreate?: boolean; enabled?: boolean; atGet?: boolean; drift?: boolean } = {},
) {
  const prf = async (salt: BufferSource, extra = 0) => {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', salt))
    d[0] = (d[0]! + extra) % 256
    return d.buffer
  }
  const create = vi.fn<(o: CredentialCreationOptions) => Promise<unknown>>(async (o) => {
    const salt = (o.publicKey!.extensions as { prf: { eval: { first: BufferSource } } }).prf.eval
      .first
    const results = opts.atCreate === false ? undefined : { first: await prf(salt) }
    return {
      rawId: RAW_ID.buffer,
      getClientExtensionResults: () => ({ prf: { enabled: opts.enabled ?? true, results } }),
    }
  })
  const get = vi.fn<(o: CredentialRequestOptions) => Promise<unknown>>(async (o) => {
    const ext = (
      o.publicKey!.extensions as {
        prf: {
          eval?: { first: BufferSource }
          evalByCredential?: Record<string, { first: BufferSource }>
        }
      }
    ).prf
    const salt = ext.eval?.first ?? ext.evalByCredential![toBase64Url(RAW_ID)]!.first
    const results =
      opts.atGet === false ? undefined : { first: await prf(salt, opts.drift ? 1 : 0) }
    return { rawId: RAW_ID.buffer, getClientExtensionResults: () => ({ prf: { results } }) }
  })
  vi.stubGlobal('navigator', { credentials: { create, get } })
  return { create, get }
}

let extractable: CryptoKey
let sent: AddPasskeyRequest | null
let stored: Map<string, string>
beforeEach(async () => {
  stored = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
  })
  extractable = await generateVaultKey()
  vault = { userId: USER, token: 't', vaultKey: extractable } as OpenVault
  sent = null
  vi.spyOn(flows, 'confirmCurrent').mockResolvedValue({ currentAuthToken: 'cur', extractable })
  vi.spyOn(apiModule, 'api').mockImplementation(async (_m, _p, o) => {
    sent = (o as { body: AddPasskeyRequest }).body
    return { ok: true } as never
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('base64url', () => {
  it('行き来できる', () => {
    expect(toBase64Url(RAW_ID)).toBe('AQIDBAUGBwgJCgsMDQ4PEPr7')
    expect([...fromBase64Url(toBase64Url(RAW_ID))]).toEqual([...RAW_ID])
  })
})

describe('パスキーを登録する', () => {
  it('PRF の値から作った鍵で金庫の鍵を包んで送る。PRF の値そのものは送らない', async () => {
    const { create, get } = fakeAuthenticator()
    await registerPasskey(vault, 'pw', 'iPhone', ['AAAAAAAAAAAAAAAAAAAAAA'])
    expect(create).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
    const opts = create.mock.calls[0]![0].publicKey!
    expect(opts.authenticatorSelection).toMatchObject({
      userVerification: 'required',
      residentKey: 'required',
    })
    expect(opts.excludeCredentials).toHaveLength(1)
    expect(sent).toMatchObject({ currentAuthToken: 'cur', credentialId: toBase64Url(RAW_ID) })
    // 名前は金庫の鍵で暗号にして送る(discussion47 の 1)。AAD に利用者と credential ID
    expect(JSON.stringify(sent)).not.toContain('iPhone')
    await expect(
      decryptJson(
        extractable,
        passkeyNameAad(USER, sent!.credentialId),
        fromBase64(sent!.nameCiphertext)!,
      ),
    ).resolves.toBe('iPhone')
    // 送った値で、金庫の鍵を開ける(開くときと同じ計算)
    const salt = fromBase64(sent!.prfSalt)!
    const prf = new Uint8Array(await crypto.subtle.digest('SHA-256', salt))
    const keys = await derivePasskeyKeys(prf, salt)
    expect(sent!.authToken).toBe(btoa(String.fromCharCode(...keys.authToken)))
    await expect(
      unwrapVaultKey(fromBase64(sent!.wrappedKey)!, keys.wrapKey, USER),
    ).resolves.toBeTruthy()
    expect(JSON.stringify(sent)).not.toContain(btoa(String.fromCharCode(...prf)))
  })

  it('作るときに値が出なくても、enabled なら開くときの形で受け取る', async () => {
    fakeAuthenticator({ atCreate: false })
    await registerPasskey(vault, 'pw', 'Mac', [])
    expect(sent).not.toBeNull()
  })

  it('PRF に対応していなければ PasskeyUnsupportedError(端末にはパスキーが残る)。何も送らない', async () => {
    fakeAuthenticator({ atCreate: false, enabled: false })
    await expect(registerPasskey(vault, 'pw', 'x', [])).rejects.toEqual(
      new PasskeyUnsupportedError(true),
    )
    fakeAuthenticator({ atGet: false })
    await expect(registerPasskey(vault, 'pw', 'x', [])).rejects.toBeInstanceOf(
      PasskeyUnsupportedError,
    )
    // 作るときと開くときで値が違う(信用できない)
    fakeAuthenticator({ drift: true })
    await expect(registerPasskey(vault, 'pw', 'x', [])).rejects.toBeInstanceOf(
      PasskeyUnsupportedError,
    )
    expect(sent).toBeNull()
  })

  it('やめた・この端末に登録済みは、それぞれの例外', async () => {
    const { create } = fakeAuthenticator()
    create.mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'))
    await expect(registerPasskey(vault, 'pw', 'x', [])).rejects.toBeInstanceOf(
      PasskeyCancelledError,
    )
    create.mockRejectedValueOnce(new DOMException('x', 'InvalidStateError'))
    await expect(registerPasskey(vault, 'pw', 'x', [])).rejects.toBeInstanceOf(PasskeyExistsError)
    expect(sent).toBeNull()
  })

  it('今のマスターパスワードが違えば、パスキーを作らない', async () => {
    const { create } = fakeAuthenticator()
    vi.mocked(flows.confirmCurrent).mockRejectedValueOnce(new ApiError(403, 'wrong_secret'))
    await expect(registerPasskey(vault, 'bad', 'x', [])).rejects.toBeInstanceOf(ApiError)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('パスキーで開く', () => {
  async function registeredInfo(): Promise<VaultInfo> {
    fakeAuthenticator()
    await registerPasskey(vault, 'pw', 'iPhone', [])
    return {
      userId: USER,
      kdfParams: DEFAULT_KDF_PARAMS,
      salt: new Uint8Array(16),
      recoverySalt: new Uint8Array(16),
      lockedUntil: null,
      passkeys: {
        state: 'available',
        credentials: [{ id: sent!.credentialId, prfSalt: sent!.prfSalt }],
      },
    }
  }

  it('PRF の値から合言葉を送り、パスキーで包んだ鍵で金庫を開ける', async () => {
    const info = await registeredInfo()
    const registered = sent!
    const settings = btoa(
      String.fromCharCode(...(await encryptJson(extractable, settingsAad(USER), DEFAULT_SETTINGS))),
    )
    let unlockBody: unknown = null
    vi.mocked(apiModule.api).mockImplementation(async (_m, path, o) => {
      expect(path).toBe('/api/unlock/passkey')
      unlockBody = (o as { body: unknown }).body
      return {
        token: 'tok',
        wrappedKey: btoa('x'.repeat(60)),
        passkeyWrappedKey: registered.wrappedKey,
        settings,
        settingsVersion: 3,
      } as never
    })
    const { get } = fakeAuthenticator()
    stored.clear()
    const opened = await unlockWithPasskey(info)
    // 開けたら、この端末の印に ID を足す(ほかの端末から届いたパスキーでも、次からボタンが出る)
    expect(passkeysHere()).toEqual([registered.credentialId])
    expect(unlockBody).toEqual({
      credentialId: registered.credentialId,
      authToken: registered.authToken,
    })
    expect(opened).toMatchObject({
      userId: USER,
      token: 'tok',
      settingsVersion: 3,
      settings: DEFAULT_SETTINGS,
    })
    expect(opened.wrappedKey).toHaveLength(60)
    const opts = get.mock.calls[0]![0]
    expect(opts.mediation).toBe('optional')
    expect(opts.publicKey!.allowCredentials).toHaveLength(1)
  })

  it('キーボードの候補から(conditional)も同じ形で問い合わせる', async () => {
    const info = await registeredInfo()
    const { get } = fakeAuthenticator()
    vi.mocked(apiModule.api).mockRejectedValue(new ApiError(403, 'password_due'))
    await expect(unlockWithPasskey(info, { conditional: true })).rejects.toBeInstanceOf(ApiError)
    expect(get.mock.calls[0]![0].mediation).toBe('conditional')
  })

  it('PRF の値が返らなければ PasskeyUnsupportedError。登録が無ければ問い合わせない', async () => {
    const info = await registeredInfo()
    fakeAuthenticator({ atGet: false })
    await expect(unlockWithPasskey(info)).rejects.toBeInstanceOf(PasskeyUnsupportedError)
    const { get } = fakeAuthenticator()
    await expect(
      unlockWithPasskey({ ...info, passkeys: { state: 'password_due' } }),
    ).rejects.toBeInstanceOf(PasskeyUnsupportedError)
    expect(get).not.toHaveBeenCalled()
  })

  it('ボタンからは、この端末のパスキーだけを問い合わせる(無ければ問い合わせない)', async () => {
    const info = await registeredInfo()
    const { get } = fakeAuthenticator()
    await expect(
      unlockWithPasskey(info, { only: ['ZZZZZZZZZZZZZZZZZZZZZZ'] }),
    ).rejects.toBeInstanceOf(PasskeyUnsupportedError)
    expect(get).not.toHaveBeenCalled()
  })
})

describe('この端末の印(discussion43 の 1)', () => {
  it('登録できたら ID を残す。登録が送れなければ残さない', async () => {
    fakeAuthenticator()
    vi.mocked(apiModule.api).mockRejectedValueOnce(new ApiError(409, 'passkey_exists'))
    await expect(registerPasskey(vault, 'pw', 'x', [])).rejects.toBeInstanceOf(ApiError)
    expect(passkeysHere()).toEqual([])
    await registerPasskey(vault, 'pw', 'x', [])
    expect(passkeysHere()).toEqual([toBase64Url(RAW_ID)])
    // 同じ ID は 1 つだけ
    await registerPasskey(vault, 'pw', 'x', [])
    expect(passkeysHere()).toEqual([toBase64Url(RAW_ID)])
  })

  it('壊れた値・読めないときは、無いものとして扱う', () => {
    stored.set('am:passkeys-here', '{"x":1}')
    expect(passkeysHere()).toEqual([])
    stored.set('am:passkeys-here', '["short", 3, "AQIDBAUGBwgJCgsMDQ4PEPr7"]')
    expect(passkeysHere()).toEqual(['AQIDBAUGBwgJCgsMDQ4PEPr7'])
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('x', 'SecurityError')
      },
    })
    expect(passkeysHere()).toEqual([])
  })
})

describe('パスキーの一覧(discussion47 の 1)', () => {
  it('暗号の名前を開く。暗号でない名前は暗号にして置き直す。開けない名前は null', async () => {
    const ct = async (id: string, name: string) =>
      btoa(String.fromCharCode(...(await encryptJson(extractable, passkeyNameAad(USER, id), name))))
    const puts: { path: string; body: { nameCiphertext: string } }[] = []
    vi.mocked(apiModule.api).mockImplementation(async (method, path, o) => {
      if (method === 'GET') {
        return {
          passkeys: [
            {
              id: 'AAAAAAAAAAAAAAAAAAAAAA',
              nameCiphertext: await ct('AAAAAAAAAAAAAAAAAAAAAA', 'iPhone'),
              legacyName: null,
              createdAt: 1,
            },
            { id: 'BBBBBBBBBBBBBBBBBBBBBB', nameCiphertext: null, legacyName: 'Mac', createdAt: 2 },
            // ほかのパスキーの名前の暗号と入れ替えられた
            {
              id: 'CCCCCCCCCCCCCCCCCCCCCC',
              nameCiphertext: await ct('AAAAAAAAAAAAAAAAAAAAAA', 'iPhone'),
              legacyName: null,
              createdAt: 3,
            },
          ],
        } as never
      }
      puts.push({ path, body: (o as { body: { nameCiphertext: string } }).body })
      return { ok: true } as never
    })
    expect(await listPasskeys(vault)).toEqual([
      { id: 'AAAAAAAAAAAAAAAAAAAAAA', name: 'iPhone', createdAt: 1 },
      { id: 'BBBBBBBBBBBBBBBBBBBBBB', name: 'Mac', createdAt: 2 },
      { id: 'CCCCCCCCCCCCCCCCCCCCCC', name: null, createdAt: 3 },
    ])
    expect(puts).toHaveLength(1)
    expect(puts[0]!.path).toBe('/api/passkeys/BBBBBBBBBBBBBBBBBBBBBB/name')
    await expect(
      decryptJson(
        extractable,
        passkeyNameAad(USER, 'BBBBBBBBBBBBBBBBBBBBBB'),
        fromBase64(puts[0]!.body.nameCiphertext)!,
      ),
    ).resolves.toBe('Mac')
  })

  it('置き直しに失敗しても、一覧は出す', async () => {
    vi.mocked(apiModule.api).mockImplementation(async (method) => {
      if (method === 'GET') {
        return {
          passkeys: [
            { id: 'BBBBBBBBBBBBBBBBBBBBBB', nameCiphertext: null, legacyName: 'Mac', createdAt: 2 },
          ],
        } as never
      }
      throw new ApiError(500, 'internal_error')
    })
    expect(await listPasskeys(vault)).toEqual([
      { id: 'BBBBBBBBBBBBBBBBBBBBBB', name: 'Mac', createdAt: 2 },
    ])
  })
})
