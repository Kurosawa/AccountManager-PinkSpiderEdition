// マスターパスワードから親の鍵を作る(Dev Spec 3.1・3.2)。Argon2id は hash-wasm(版を固定。discussion04)
import { argon2id } from 'hash-wasm'
import { SALT_BYTES } from '../shared/api-types.ts'
import { parseKdfParams, type KdfParams } from '../shared/kdf-params.ts'

export { SALT_BYTES } from '../shared/api-types.ts'
export {
  DEFAULT_KDF_PARAMS,
  KDF_LIMITS,
  parseKdfParams,
  type KdfParams,
} from '../shared/kdf-params.ts'

export const MASTER_KEY_BYTES = 32

/** 親の鍵 = Argon2id(マスターパスワード, salt)。使い終わったら呼ぶ側で wipe する */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  const p = parseKdfParams(params)
  if (salt.length !== SALT_BYTES) throw new Error('salt の長さが違います')
  return argon2id({
    password: password.normalize('NFC'),
    salt,
    memorySize: p.m,
    iterations: p.t,
    parallelism: p.p,
    hashLength: MASTER_KEY_BYTES,
    outputType: 'binary',
  })
}
