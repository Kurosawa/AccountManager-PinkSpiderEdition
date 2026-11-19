// パスキーの登録・一覧・削除(フェーズ 2 の 4。Dev Spec 17 章・discussion38)。
// パスキーの PRF の値から、パスキーの包む鍵と合言葉を作る。PRF の値・鍵はサーバーに送らない
import { randomBytes, utf8, wipe } from '../crypto/bytes.ts'
import { derivePasskeyKeys, wrapVaultKey } from '../crypto/keys.ts'
import { decryptJson, encryptJson, passkeyNameAad } from '../crypto/record.ts'
import {
  CREDENTIAL_ID_PATTERN,
  MAX_PASSKEYS,
  PRF_SALT_BYTES,
  type PasskeyUnlockRequest,
  type PasskeyUnlockResponse,
  type AddPasskeyRequest,
  type RenamePasskeyRequest,
} from '../shared/api-types.ts'
import { fromBase64, toBase64 } from '../shared/base64.ts'
import { api } from './api.ts'
import { parseListPasskeys, parsePasskeyUnlock } from './responses.ts'
import { confirmCurrent, openWith, type OpenVault, type VaultInfo } from './flows.ts'

/** この端末・ブラウザでは、パスキーの PRF が使えない */
export class PasskeyUnsupportedError extends Error {
  /** パスキーは端末に作られたあとか(作られていれば、端末の側で消してもらう) */
  constructor(readonly created: boolean) {
    super('PRF が使えません')
  }
}
/** 利用者がやめた(または時間が切れた) */
export class PasskeyCancelledError extends Error {}
/** この端末(パスキーの置き場所)には、もう登録してある */
export class PasskeyExistsError extends Error {}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/**
 * この端末で PRF が使えそうか。'unknown' は、ブラウザが答えを持たない(試すまで分からない)。
 * getClientCapabilities は WebAuthn Level 3 の機能で、無いブラウザもある
 */
export async function passkeySupport(): Promise<'yes' | 'no' | 'unknown'> {
  const PKC = globalThis.PublicKeyCredential as
    | (typeof PublicKeyCredential & {
        getClientCapabilities?: () => Promise<Record<string, boolean | undefined>>
      })
    | undefined
  if (!PKC || !navigator.credentials) return 'no'
  try {
    const caps = await PKC.getClientCapabilities?.()
    const prf = caps?.['extension:prf']
    if (prf === true) return 'yes'
    if (prf === false) return 'no'
  } catch {
    // 答えられなければ、試すまで分からない
  }
  return 'unknown'
}

/** 設定の一覧に出す、登録したパスキー。name が null なら、名前を復号できなかった */
export interface PasskeyItem {
  id: string
  name: string | null
  createdAt: number
}

async function encryptName(vault: OpenVault, id: string, name: string): Promise<string> {
  return toBase64(await encryptJson(vault.vaultKey, passkeyNameAad(vault.userId, id), name))
}

/**
 * 登録したパスキーの一覧。名前はブラウザの中で復号する(discussion47 の 1)。
 * 前の版で登録した暗号でない名前は、暗号にして置き直す(失敗しても一覧は出す。次に開いたときにまた試す)
 */
export async function listPasskeys(vault: OpenVault): Promise<PasskeyItem[]> {
  const { passkeys } = await api('GET', '/api/passkeys', {
    parse: parseListPasskeys,
    token: vault.token,
  })
  return Promise.all(
    passkeys.map(async (p): Promise<PasskeyItem> => {
      if (p.nameCiphertext === null) {
        const name = p.legacyName ?? ''
        try {
          await api('PUT', `/api/passkeys/${encodeURIComponent(p.id)}/name`, {
            token: vault.token,
            body: {
              nameCiphertext: await encryptName(vault, p.id, name),
            } satisfies RenamePasskeyRequest,
          })
        } catch {
          // 置き直せなくても、名前は出せる
        }
        return { id: p.id, name, createdAt: p.createdAt }
      }
      let name: string | null = null
      try {
        const data = fromBase64(p.nameCiphertext)
        const value = data
          ? await decryptJson(vault.vaultKey, passkeyNameAad(vault.userId, p.id), data)
          : null
        if (typeof value === 'string') name = value
      } catch {
        // 復号できない(書き換えられた・別の人のもの)。名前を出さずに、消せるようにだけする
      }
      return { id: p.id, name, createdAt: p.createdAt }
    }),
  )
}

export async function deletePasskey(vault: OpenVault, id: string): Promise<void> {
  await api('DELETE', `/api/passkeys/${encodeURIComponent(id)}`, { token: vault.token })
}

type PrfResults = { enabled?: boolean; results?: { first?: ArrayBuffer | ArrayBufferView } }

function prfOf(cred: PublicKeyCredential): PrfResults | undefined {
  return (cred.getClientExtensionResults() as { prf?: PrfResults }).prf
}

function bytesOf(v: ArrayBuffer | ArrayBufferView): Uint8Array {
  return v instanceof ArrayBuffer
    ? new Uint8Array(v.slice(0))
    : new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength))
}

/** WebAuthn の失敗を、この画面の例外に直す */
function mapWebAuthnError(e: unknown): never {
  if (e instanceof DOMException) {
    if (e.name === 'InvalidStateError') throw new PasskeyExistsError()
    if (e.name === 'NotAllowedError' || e.name === 'AbortError') throw new PasskeyCancelledError()
    if (e.name === 'NotSupportedError') throw new PasskeyUnsupportedError(false)
  }
  throw e
}

/** パスキーで PRF の値を受け取る(開くときと同じ形。登録の確かめにも使う) */
async function evaluatePrf(
  credentialId: Uint8Array,
  prfSalt: Uint8Array,
): Promise<Uint8Array | null> {
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: new Uint8Array(credentialId) }],
        userVerification: 'required',
        timeout: 120_000,
        extensions: {
          prf: { eval: { first: new Uint8Array(prfSalt) } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch (e) {
    mapWebAuthnError(e)
  }
  const first = cred && prfOf(cred)?.results?.first
  return first ? bytesOf(first) : null
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/**
 * パスキーを登録する(discussion38)。今のマスターパスワードを確かめ、端末にパスキーを作り、
 * PRF の値から作った鍵で金庫の鍵を包んで送る。
 * 作ったあとに、開くときと同じ形でもう一度 PRF の値を受け取り、同じ値かを確かめる(ステップの確かめ。discussion38 の 5)
 */
export async function registerPasskey(
  vault: OpenVault,
  current: string,
  name: string,
  existingIds: readonly string[],
): Promise<void> {
  const { currentAuthToken, extractable } = await confirmCurrent(vault, current, '/api/passkeys')
  const prfSalt = randomBytes(PRF_SALT_BYTES)
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'AccountManager' },
        // 同じ利用者の印。同じ置き場所に 2 つ目を作ると上書きされうるので、excludeCredentials で断る
        user: {
          id: utf8(vault.userId).slice(0, 64),
          name: 'AccountManager',
          displayName: 'AccountManager',
        },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: existingIds.map((id) => ({
          type: 'public-key',
          id: fromBase64Url(id),
        })),
        timeout: 120_000,
        extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch (e) {
    mapWebAuthnError(e)
  }
  if (!cred) throw new PasskeyCancelledError()
  const rawId = new Uint8Array(cred.rawId)
  const created = prfOf(cred)
  const atCreate = created?.results?.first ? bytesOf(created.results.first) : null
  // 作るときに PRF に対応していないと分かれば、ここで止める(パスキーは端末に残る)
  if (!atCreate && created?.enabled !== true) throw new PasskeyUnsupportedError(true)

  const prf = await evaluatePrf(rawId, prfSalt)
  if (!prf || (atCreate && !sameBytes(atCreate, prf))) {
    wipe(atCreate, prf)
    throw new PasskeyUnsupportedError(true)
  }
  wipe(atCreate)
  const keys = await derivePasskeyKeys(prf, prfSalt)
  wipe(prf)
  const credentialId = toBase64Url(rawId)
  const body: AddPasskeyRequest = {
    currentAuthToken,
    credentialId,
    nameCiphertext: await encryptName(vault, credentialId, name),
    prfSalt: toBase64(prfSalt),
    authToken: toBase64(keys.authToken),
    wrappedKey: toBase64(await wrapVaultKey(extractable, keys.wrapKey, vault.userId)),
  }
  wipe(keys.authToken)
  await api('POST', '/api/passkeys', { body, token: vault.token })
  rememberHere(body.credentialId)
}

/**
 * この端末・ブラウザで登録した、または開けたパスキーの credential ID(discussion43 の 1)。
 * ID は秘密ではない(`/api/me` が誰にでも返す)。鍵・トークンは置かない(Dev Spec 3.4)。
 * 読めない・書けない(プライベートの窓など)ときは、無いものとして扱う
 */
const HERE_KEY = 'am:passkeys-here'

export function passkeysHere(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HERE_KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    return v.filter((x): x is string => typeof x === 'string' && CREDENTIAL_ID_PATTERN.test(x))
  } catch {
    return []
  }
}

function rememberHere(id: string): void {
  try {
    const ids = passkeysHere().filter((x) => x !== id)
    ids.push(id)
    // 消したパスキーの ID が残っても害はないが、増え続けないよう新しい方から残す
    localStorage.setItem(HERE_KEY, JSON.stringify(ids.slice(-MAX_PASSKEYS * 2)))
  } catch {
    // 印を残せなくても、キーボードの候補からは開ける
  }
}

/** キーボードの候補(パスキーの自動入力)が使えるか(discussion40 の 2) */
export async function conditionalAvailable(): Promise<boolean> {
  try {
    return (await globalThis.PublicKeyCredential?.isConditionalMediationAvailable?.()) === true
  } catch {
    return false
  }
}

/**
 * パスキーで開く(Dev Spec 17 章)。登録したパスキーのどれかで PRF の値を受け取り、合言葉を送って、
 * パスキーで包んだ金庫の鍵を開く。conditional なら、キーボードの候補から選ばれるのを待つ(signal で止める)。
 * only を渡すと、その ID のパスキーだけを問い合わせる(ボタンは、この端末のパスキーだけ。discussion43 の 1)。
 * 開けたら、この端末の印に ID を足す
 */
export async function unlockWithPasskey(
  info: VaultInfo,
  opts: { conditional?: boolean; signal?: AbortSignal; only?: readonly string[] } = {},
): Promise<OpenVault> {
  if (info.passkeys.state !== 'available') throw new PasskeyUnsupportedError(false)
  const only = opts.only
  const creds = info.passkeys.credentials.filter((c) => !only || only.includes(c.id))
  if (creds.length === 0) throw new PasskeyUnsupportedError(false)
  const salts = new Map(creds.map((c) => [c.id, fromBase64(c.prfSalt)!]))
  const evalByCredential: Record<string, { first: Uint8Array<ArrayBuffer> }> = {}
  for (const [id, salt] of salts) evalByCredential[id] = { first: salt }
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.get({
      mediation: opts.conditional ? 'conditional' : 'optional',
      signal: opts.signal,
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [...salts.keys()].map((id) => ({
          type: 'public-key',
          id: fromBase64Url(id),
        })),
        userVerification: 'required',
        timeout: opts.conditional ? undefined : 120_000,
        extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch (e) {
    mapWebAuthnError(e)
  }
  if (!cred) throw new PasskeyCancelledError()
  const id = toBase64Url(cred.rawId)
  const salt = salts.get(id)
  const first = prfOf(cred)?.results?.first
  if (!salt || !first) throw new PasskeyUnsupportedError(false)
  const prf = bytesOf(first)
  const keys = await derivePasskeyKeys(prf, salt)
  wipe(prf)
  let res: PasskeyUnlockResponse
  try {
    res = await api('POST', '/api/unlock/passkey', {
      parse: parsePasskeyUnlock,
      body: {
        credentialId: id,
        authToken: toBase64(keys.authToken),
      } satisfies PasskeyUnlockRequest,
    })
  } finally {
    wipe(keys.authToken)
  }
  const passkeyWrapped = fromBase64(res.passkeyWrappedKey)
  if (!passkeyWrapped) throw new Error('サーバーの応答の形が違います')
  const opened = await openWith(info.userId, keys.wrapKey, info, res, passkeyWrapped)
  rememberHere(id)
  return opened
}
