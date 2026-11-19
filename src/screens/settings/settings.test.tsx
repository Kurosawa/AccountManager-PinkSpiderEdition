// @vitest-environment jsdom
// 設定の区切り: 保存・2 段の確かめ・セッション切れ・取り込みのフォーカスの移り方。
// 暗号と通信は flows.ts などの差し替えで置き、画面の動きだけを確かめる(暗号の流れは src/vault の各テスト)
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../vault/api.ts'
import { runImport } from '../../vault/csv-import.ts'
import {
  commitRecoveryKey,
  deleteAllData,
  prepareRecoveryKey,
  saveSettings,
} from '../../vault/flows.ts'
import { deletePasskey, listPasskeys } from '../../vault/passkeys.ts'
import type { OpenVault } from '../../vault/flows.ts'
import { sampleVault } from '../testing/setup.ts'
import { AutoLock } from './AutoLock.tsx'
import { DeleteAll } from './DeleteAll.tsx'
import { ImportCsv } from './ImportCsv.tsx'
import { Passkeys } from './Passkeys.tsx'
import { RecoveryKey } from './RecoveryKey.tsx'

vi.mock('../../vault/flows.ts', () => ({
  saveSettings: vi.fn<(...args: never[]) => unknown>(),
  prepareRecoveryKey: vi.fn<(...args: never[]) => unknown>(),
  commitRecoveryKey: vi.fn<(...args: never[]) => unknown>(),
  deleteAllData: vi.fn<(...args: never[]) => unknown>(),
}))
vi.mock('../../vault/passkeys.ts', () => ({
  listPasskeys: vi.fn<(...args: never[]) => unknown>(),
  deletePasskey: vi.fn<(...args: never[]) => unknown>(),
  registerPasskey: vi.fn<(...args: never[]) => unknown>(),
  passkeySupport: vi.fn<() => Promise<string>>(async () => 'yes'),
  PasskeyCancelledError: class extends Error {},
  PasskeyExistsError: class extends Error {},
  PasskeyUnsupportedError: class extends Error {},
}))
// CSV を読んで件数を数える部分は本物を使い、送る部分だけを差し替える
vi.mock('../../vault/csv-import.ts', async (original) => ({
  ...(await original<typeof import('../../vault/csv-import.ts')>()),
  runImport: vi.fn<(...args: never[]) => unknown>(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('自動で閉じるまでの時間', () => {
  it('選んで保存すると、保存した金庫を渡し、済んだことを知らせる', async () => {
    const vault = sampleVault()
    const saved = sampleVault({ settingsVersion: 2 })
    vi.mocked(saveSettings).mockResolvedValue(saved)
    const onChange = vi.fn<(v: OpenVault) => void>()
    render(<AutoLock vault={vault} onChange={onChange} onLock={vi.fn<() => void>()} />)
    await userEvent.click(screen.getByRole('radio', { name: '15 分' }))
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(saveSettings).toHaveBeenCalledWith(vault, { ...vault.settings, autoLockMinutes: 15 })
    expect(onChange).toHaveBeenCalledWith(saved)
    expect(screen.getByRole('status').textContent).toBe('保存しました')
  })

  it('セッションが切れていたら、誤りを出さずに管理画面を閉じる', async () => {
    vi.mocked(saveSettings).mockRejectedValue(new ApiError(401, 'invalid_session'))
    const onLock = vi.fn<() => void>()
    render(
      <AutoLock vault={sampleVault()} onChange={vi.fn<(v: OpenVault) => void>()} onLock={onLock} />,
    )
    await userEvent.click(screen.getByRole('radio', { name: '1 分' }))
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(onLock).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ほかの端末で設定が変わっていたら、開き直すよう知らせる', async () => {
    vi.mocked(saveSettings).mockRejectedValue(new ApiError(409, 'version_conflict'))
    render(
      <AutoLock
        vault={sampleVault()}
        onChange={vi.fn<(v: OpenVault) => void>()}
        onLock={vi.fn<() => void>()}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: '30 分' }))
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(screen.getByRole('alert').textContent).toContain('ほかの端末で設定が変わっています')
  })
})

describe('復旧キーの作り直し', () => {
  const KEY = 'ABCD-EFGH-JKLM-NPQR'

  it('最後の 4 文字が合うまで置き換えず、合えば作り直す', async () => {
    const vault = sampleVault()
    const prepared = { recoveryKey: KEY, request: {} as never }
    vi.mocked(prepareRecoveryKey).mockResolvedValue(prepared)
    vi.mocked(commitRecoveryKey).mockResolvedValue()
    render(<RecoveryKey vault={vault} onLock={vi.fn<() => void>()} />)

    await userEvent.type(screen.getByLabelText('今のマスターパスワード'), 'current-pw')
    await userEvent.click(screen.getByRole('button', { name: '新しい復旧キーを作る' }))
    expect(await screen.findByText(KEY)).toBeTruthy()
    expect(prepareRecoveryKey).toHaveBeenCalledWith(vault, 'current-pw')

    const tail = screen.getByLabelText('控えたことの確かめ: 復旧キーの最後の 4 文字')
    await userEvent.type(tail, 'XXXX')
    await userEvent.click(screen.getByRole('button', { name: '作り直す' }))
    expect(screen.getByRole('alert').textContent).toContain('最後の 4 文字が違います')
    expect(commitRecoveryKey).not.toHaveBeenCalled()

    await userEvent.clear(tail)
    await userEvent.type(tail, 'npqr')
    await userEvent.click(screen.getByRole('button', { name: '作り直す' }))
    expect(commitRecoveryKey).toHaveBeenCalledWith(vault, prepared)
    expect(screen.getByRole('status').textContent).toContain('復旧キーを作り直しました')
    expect(screen.queryByText(KEY)).toBeNull()
  })
})

describe('自分のデータをすべて消す', () => {
  it('印を付けて「消す」→「すべて消す」の 2 段を通ったときだけ消す', async () => {
    const vault = sampleVault()
    vi.mocked(deleteAllData).mockResolvedValue()
    const onDeleted = vi.fn<() => void>()
    render(<DeleteAll vault={vault} onDeleted={onDeleted} onLock={vi.fn<() => void>()} />)

    await userEvent.type(screen.getByLabelText('今のマスターパスワード'), 'current-pw')
    await userEvent.click(screen.getByRole('button', { name: '消す' }))
    expect(screen.getByRole('alert').textContent).toBe('確かめの印を付けてください')

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: '消す' }))
    expect(deleteAllData).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('本当にすべて消しますか?')

    await userEvent.click(screen.getByRole('button', { name: 'すべて消す' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(deleteAllData).toHaveBeenCalledWith(vault, 'current-pw')
  })

  it('今のマスターパスワードが違えば、確かめの段を閉じて知らせる', async () => {
    vi.mocked(deleteAllData).mockRejectedValue(new ApiError(403, 'wrong_secret'))
    const onDeleted = vi.fn<() => void>()
    render(<DeleteAll vault={sampleVault()} onDeleted={onDeleted} onLock={vi.fn<() => void>()} />)
    await userEvent.type(screen.getByLabelText('今のマスターパスワード'), 'wrong')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: '消す' }))
    await userEvent.click(screen.getByRole('button', { name: 'すべて消す' }))
    // 確かめの段(これも alert)が閉じ、誤りの知らせだけが残る
    expect(await screen.findByText('今のマスターパスワードが違います')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '消す' })).toBeTruthy()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})

describe('パスキー', () => {
  it('一覧を読み、消したら結果へフォーカスを移し、端末の側でも消すよう知らせる', async () => {
    const vault = sampleVault()
    const item = { id: 'cred-1', name: 'iPhone', createdAt: Date.UTC(2026, 10, 1) }
    vi.mocked(listPasskeys).mockResolvedValueOnce([item]).mockResolvedValueOnce([])
    vi.mocked(deletePasskey).mockResolvedValue()
    render(<Passkeys vault={vault} onLock={vi.fn<() => void>()} />)

    await userEvent.click(await screen.findByRole('button', { name: '「iPhone」の登録を消す' }))
    expect(deletePasskey).toHaveBeenCalledWith(vault, 'cred-1')
    expect(await screen.findByText('まだ登録していません')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('「iPhone」の登録を消しました')
    expect(document.activeElement?.className).toContain('section-result')
    expect(document.activeElement?.textContent).toContain('端末の側でも')
  })

  it('一覧を読めないときは、読み込み中のままにせず誤りを出す', async () => {
    vi.mocked(listPasskeys).mockRejectedValue(new ApiError(0, 'network'))
    render(<Passkeys vault={sampleVault()} onLock={vi.fn<() => void>()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('通信できませんでした')
    expect(screen.queryByText('読み込んでいます…')).toBeNull()
  })
})

describe('ほかのアプリから取り込む', () => {
  const CSV = [
    'name,url,username,password,note',
    'example.com,https://example.com/login,taro,pw-1,',
    'Shop,https://www.shop.example/,hanako,pw-2,',
  ].join('\r\n')

  it('読む → 件数へフォーカス → 取り込む → 結果へフォーカスと、CSV を消すお願い', async () => {
    vi.mocked(runImport).mockResolvedValue({ added: 2, stoppedAtLimit: false })
    const onImported = vi.fn<() => void>()
    render(
      <ImportCsv
        vault={sampleVault()}
        entries={[]}
        onImported={onImported}
        onLock={vi.fn<() => void>()}
      />,
    )
    await userEvent.upload(
      screen.getByLabelText('CSV のファイル'),
      new File([CSV], 'passwords.csv', { type: 'text/csv' }),
    )
    await userEvent.click(screen.getByRole('button', { name: '読み込む' }))

    const plan = await screen.findByText(/Chrome の CSV です/)
    await waitFor(() => expect(document.activeElement).toBe(plan))
    expect(screen.getByText('足す: 2 件')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '取り込む' }))
    await waitFor(() => expect(onImported).toHaveBeenCalled())
    expect(vi.mocked(runImport).mock.calls[0]?.[1]).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe('2 件を足しました')
    expect(document.activeElement?.textContent).toContain('暗号になっていません')
    // 取り込んだら、ファイルを選ぶところに戻る
    expect(screen.getByLabelText('CSV のファイル')).toBeTruthy()
  })

  it('「やめる」で、ファイルを選ぶ欄へフォーカスを戻す', async () => {
    render(
      <ImportCsv
        vault={sampleVault()}
        entries={[]}
        onImported={vi.fn<() => void>()}
        onLock={vi.fn<() => void>()}
      />,
    )
    await userEvent.upload(
      screen.getByLabelText('CSV のファイル'),
      new File([CSV], 'passwords.csv', { type: 'text/csv' }),
    )
    await userEvent.click(screen.getByRole('button', { name: '読み込む' }))
    await userEvent.click(await screen.findByRole('button', { name: 'やめる' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('CSV のファイル')),
    )
    expect(runImport).not.toHaveBeenCalled()
  })

  it('Chrome・Safari の CSV でなければ、読まずに知らせる', async () => {
    render(
      <ImportCsv
        vault={sampleVault()}
        entries={[]}
        onImported={vi.fn<() => void>()}
        onLock={vi.fn<() => void>()}
      />,
    )
    await userEvent.upload(
      screen.getByLabelText('CSV のファイル'),
      new File(['a,b,c\r\n1,2,3'], 'other.csv', { type: 'text/csv' }),
    )
    await userEvent.click(screen.getByRole('button', { name: '読み込む' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Chrome か Safari が書き出した CSV',
    )
  })
})
