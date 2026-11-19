// hash-wasm の Argon2id が、別の実装(Node.js に組み込みの OpenSSL のもの)と同じ答えを出すかを確かめる。
// 同梱する WebAssembly が正しく Argon2id を計算していることの確かめ(discussion04)。
// node:crypto を使うので、型検査は tsconfig.node.json で行う
import { argon2Sync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { randomBytes } from './bytes.ts'
import { DEFAULT_KDF_PARAMS, deriveMasterKey, SALT_BYTES, type KdfParams } from './kdf.ts'

describe('Argon2id を別の実装と突き合わせる', () => {
  const cases: Array<[string, KdfParams]> = [
    ['correct horse battery staple', DEFAULT_KDF_PARAMS],
    ['日本語のマスターパスワード🔑', DEFAULT_KDF_PARAMS],
    ['aoi-sora-hashiru-neko', { alg: 'argon2id', m: 19456, t: 2, p: 2 }],
  ]

  it.each(cases)('%s', async (password, params) => {
    const salt = randomBytes(SALT_BYTES)
    const ours = await deriveMasterKey(password, salt, params)
    const reference = argon2Sync('argon2id', {
      message: Buffer.from(password.normalize('NFC'), 'utf8'),
      nonce: Buffer.from(salt),
      parallelism: params.p,
      tagLength: 32,
      memory: params.m,
      passes: params.t,
    })
    expect(Buffer.from(ours).toString('hex')).toBe(reference.toString('hex'))
  })
})
