// 画面のテストで共通に使う準備。テストごとに描いたものを片付ける(vitest の globals を使わないので、ここで登録する)
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import type { Entry } from '../../vault/entry.ts'
import type { OpenVault } from '../../vault/flows.ts'
import { DEFAULT_KDF_PARAMS } from '../../shared/kdf-params.ts'
import { DEFAULT_SETTINGS } from '../../vault/settings.ts'

afterEach(() => cleanup())

/** 画面に渡す、開いた金庫の見本(鍵は使わないので、形だけ) */
export function sampleVault(overrides: Partial<OpenVault> = {}): OpenVault {
  return {
    userId: 'u'.repeat(64),
    token: 'token',
    vaultKey: {} as CryptoKey,
    settings: DEFAULT_SETTINGS,
    settingsVersion: 1,
    salt: new Uint8Array(16),
    kdfParams: DEFAULT_KDF_PARAMS,
    wrappedKey: new Uint8Array(60),
    ...overrides,
  }
}

export function sampleEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    schema: 1,
    serviceName: '動画見放題サービス',
    tags: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}
