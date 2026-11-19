// 新しいマスターパスワードを 2 回入れてもらう(金庫を作るときと、回復のとき)
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  checkMasterPassword,
  loadCommonPasswords,
  MIN_MASTER_PASSWORD_LENGTH,
} from '../vault/password-policy.ts'
import { ErrorText, Field } from './common.tsx'

export function NewPassword(props: {
  submitLabel: string
  busy: boolean
  onSubmit: (password: string) => void
  /** 同じフォームの先頭に置く欄(マスターパスワードの変更での「今のマスターパスワード」) */
  before?: ReactNode
}) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  // よく使われるパスワードの一覧を、打っている間に読み込んでおく
  useEffect(() => {
    loadCommonPasswords().catch(() => undefined)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    let common: ReadonlySet<string>
    try {
      common = await loadCommonPasswords()
    } catch {
      // 一覧を確かめられないまま進めない
      return setProblem('確かめるための一覧を読み込めませんでした。読み込み直してください')
    }
    const reason = checkMasterPassword(password, common)
    if (reason) return setProblem(reason)
    if (password !== again) return setProblem('2 つの入力が違います')
    setProblem(null)
    props.onSubmit(password)
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      {props.before}
      <Field
        label={props.before ? '新しいマスターパスワード' : 'マスターパスワード'}
        value={password}
        onChange={setPassword}
        autoFocus={!props.before}
        disabled={props.busy}
        hint={`${MIN_MASTER_PASSWORD_LENGTH} 文字以上。言葉を 3〜4 つ並べる(例: aoi-sora-hashiru-neko)と、覚えやすく強くなります`}
      />
      <Field
        label={props.before ? '新しいマスターパスワード(もう一度)' : 'マスターパスワード(もう一度)'}
        value={again}
        onChange={setAgain}
        disabled={props.busy}
      />
      <ErrorText>{problem}</ErrorText>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={props.busy}>
          {props.busy ? '鍵を作っています…' : props.submitLabel}
        </button>
      </div>
    </form>
  )
}
