// @vitest-environment jsdom
// 管理画面を開く: マスターパスワードで開く。違えば知らせ、待たせている間はその時刻を出す
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_KDF_PARAMS } from '../shared/kdf-params.ts'
import { ApiError } from '../vault/api.ts'
import { unlockVault, type OpenVault, type VaultInfo } from '../vault/flows.ts'
import { sampleVault } from './testing/setup.ts'
import { Unlock } from './Unlock.tsx'

vi.mock('../vault/flows.ts', () => ({ unlockVault: vi.fn<(...args: never[]) => unknown>() }))
vi.mock('../vault/passkeys.ts', () => ({
  conditionalAvailable: vi.fn<() => Promise<boolean>>(async () => false),
  passkeysHere: vi.fn<() => string[]>(() => []),
  unlockWithPasskey: vi.fn<(...args: never[]) => unknown>(),
  PasskeyCancelledError: class extends Error {},
  PasskeyUnsupportedError: class extends Error {},
}))

const INFO: VaultInfo = {
  userId: 'u'.repeat(64),
  kdfParams: DEFAULT_KDF_PARAMS,
  salt: new Uint8Array(16),
  recoverySalt: new Uint8Array(16),
  lockedUntil: null,
  passkeys: { state: 'none' },
}

function renderUnlock(info: VaultInfo = INFO) {
  const onOpen = vi.fn<(vault: OpenVault) => void>()
  const onRecover = vi.fn<() => void>()
  render(<Unlock info={info} onOpen={onOpen} onRecover={onRecover} />)
  return { onOpen, onRecover }
}

// 関数を返すと後片付けとして呼ばれるので、何も返さない
beforeEach(() => {
  vi.mocked(unlockVault).mockReset()
})

describe('管理画面を開く', () => {
  it('マスターパスワードを入れるまで「開く」は押せず、入れて押すと開いた金庫を渡す', async () => {
    const vault = sampleVault()
    vi.mocked(unlockVault).mockResolvedValue(vault)
    const { onOpen } = renderUnlock()
    const open = screen.getByRole<HTMLButtonElement>('button', { name: '開く' })
    expect(open.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('マスターパスワード'), 'aoi-sora-hashiru-neko')
    await userEvent.click(open)
    // 鍵を作る前に「開いています…」を描かせてから開ける
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(vault))
    expect(unlockVault).toHaveBeenCalledWith(INFO, 'aoi-sora-hashiru-neko')
  })

  it('違うマスターパスワードなら、開かずに知らせ、もう一度押せる', async () => {
    vi.mocked(unlockVault).mockImplementation(async () => {
      throw new ApiError(403, 'wrong_secret')
    })
    const { onOpen } = renderUnlock()
    await userEvent.type(screen.getByLabelText('マスターパスワード'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '開く' }))
    expect((await screen.findByRole('alert')).textContent).toBe('マスターパスワードが違います')
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '開く' }).disabled).toBe(false)
  })

  it('待たせている間は、初めからその時刻を出す', () => {
    renderUnlock({ ...INFO, lockedUntil: new Date(2026, 10, 19, 18, 30).getTime() })
    expect(screen.getByRole('alert').textContent).toContain('18:30 まで待ってください')
  })

  it('パスキーを登録していなければ、パスキーのボタンは出さない。復旧キーの入口は出す', async () => {
    const { onRecover } = renderUnlock()
    expect(screen.queryByRole('button', { name: /パスキーで開く/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /復旧キーで開く/ }))
    expect(onRecover).toHaveBeenCalled()
  })
})
