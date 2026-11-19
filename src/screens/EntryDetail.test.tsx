// @vitest-environment jsdom
// 詳細の面: パスワードは初めは伏せ、押したときだけ見せる。コピーしたらボタンと知らせが変わる
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copySecret } from '../vault/clipboard.ts'
import { EntryDetail } from './EntryDetail.tsx'
import { sampleEntry } from './testing/setup.ts'

vi.mock('../vault/clipboard.ts', () => ({
  CLEAR_AFTER_MS: 30_000,
  copySecret: vi.fn<(text: string) => Promise<boolean>>(),
}))

const PASSWORD = 'hidden-Pa55word'

function renderDetail() {
  return render(
    <EntryDetail
      item={{
        id: 'i',
        version: 1,
        entry: sampleEntry({ accountName: 'sample', password: PASSWORD }),
      }}
      busy={false}
      problem={null}
      onEdit={() => undefined}
      onDelete={() => undefined}
      onAdvanceRenewal={() => undefined}
    />,
  )
}

// 関数を返すと後片付けとして呼ばれるので、何も返さない
beforeEach(() => {
  vi.mocked(copySecret).mockReset()
})

describe('詳細の面', () => {
  it('パスワードは初めは伏せ、「見せる」で見せ、「隠す」で戻す', async () => {
    renderDetail()
    expect(screen.queryByText(PASSWORD)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを見せる' }))
    expect(screen.getByText(PASSWORD)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'パスワードを隠す' }))
    expect(screen.queryByText(PASSWORD)).toBeNull()
  })

  it('コピーすると、そのボタンが「コピーしました」になり、30 秒で消える知らせを出す', async () => {
    vi.mocked(copySecret).mockResolvedValue(true)
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'パスワードをコピー' }))
    expect(copySecret).toHaveBeenCalledWith(PASSWORD)
    expect(screen.getByRole('button', { name: 'パスワードをコピー' }).textContent).toBe(
      'コピーしました',
    )
    expect(screen.getByRole('button', { name: 'アカウント名をコピー' }).textContent).toBe('コピー')
    expect(screen.getByRole('status').textContent).toBe(
      'コピーしました。30 秒たつと、クリップボードから消えます。',
    )
  })

  it('コピーできなければ、もう一度押すよう知らせる', async () => {
    vi.mocked(copySecret).mockResolvedValue(false)
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'パスワードをコピー' }))
    expect(screen.getByRole('alert').textContent).toContain('コピーできませんでした')
  })
})
