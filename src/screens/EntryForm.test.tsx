// @vitest-environment jsdom
// 新規登録の画面: 入れた値を下書きにして渡す。足りない・おかしい値は、渡さずに画面で知らせる
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EntryForm, type Draft } from './EntryForm.tsx'
import './testing/setup.ts'

function renderForm() {
  const onSubmit = vi.fn<(draft: Draft) => void>()
  render(<EntryForm busy={false} problem={null} onSubmit={onSubmit} onCancel={() => undefined} />)
  return { onSubmit }
}

const save = () => fireEvent.click(screen.getByRole('button', { name: '保存する' }))

describe('新規登録', () => {
  it('サービス名・アカウント名・タグを、整えた下書きにして渡す', async () => {
    const { onSubmit } = renderForm()
    await userEvent.type(screen.getByLabelText('サービス名(必須)'), '  音楽ストリーミング ')
    await userEvent.type(screen.getByLabelText('アカウント名'), 'sample.listener')
    await userEvent.type(screen.getByLabelText('タグ', { exact: false }), 'サブスク、家族')
    save()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      serviceName: '音楽ストリーミング',
      accountName: 'sample.listener',
      tags: ['サブスク', '家族'],
    })
  })

  it('サービス名が空なら、渡さずに知らせる', () => {
    const { onSubmit } = renderForm()
    save()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('サービス名を入れてください')
  })

  it('http・https 以外の URL は、渡さずに知らせる', async () => {
    const { onSubmit } = renderForm()
    await userEvent.type(screen.getByLabelText('サービス名(必須)'), 'ネット銀行')
    await userEvent.type(screen.getByLabelText('URL'), 'javascript:alert(1)')
    save()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('http:// か https://')
  })

  it('「作って入れる」で強いパスワードを作り、見える形で欄に入れる', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: '作って入れる' }))
    const field = screen.getByLabelText<HTMLInputElement>('パスワード')
    expect(field.type).toBe('text')
    expect(field.value.length).toBeGreaterThanOrEqual(16)
  })
})
