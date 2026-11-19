// はじめての準備(PRD 3.3・Dev Spec 5.1)。マスターパスワードを決め、復旧キーを控えてもらってから送る
import { useState, type FormEvent } from 'react'
import { recoveryKeyTail } from '../crypto/recovery-key.ts'
import { commitVault, prepareVault, type OpenVault, type PreparedVault } from '../vault/flows.ts'
import { describeFailure, ErrorText, Field, Gate, nextPaint } from './common.tsx'
import { NewPassword } from './NewPassword.tsx'

export function CreateVault(props: { userId: string; onOpen: (vault: OpenVault) => void }) {
  const [prepared, setPrepared] = useState<PreparedVault | null>(null)
  const [busy, setBusy] = useState(false)
  const [tail, setTail] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const prepare = async (password: string) => {
    setBusy(true)
    setProblem(null)
    try {
      await nextPaint()
      setPrepared(await prepareVault(props.userId, password))
    } catch (e) {
      setProblem(describeFailure(e, ''))
    } finally {
      setBusy(false)
    }
  }

  const commit = async (e: FormEvent) => {
    e.preventDefault()
    if (!prepared) return
    if (tail.trim().toUpperCase() !== recoveryKeyTail(prepared.recoveryKey)) {
      return setProblem('最後の 4 文字が違います。控えを見直してください')
    }
    setBusy(true)
    setProblem(null)
    try {
      props.onOpen(await commitVault(prepared))
    } catch (err) {
      setProblem(describeFailure(err, ''))
      setBusy(false)
    }
  }

  if (!prepared) {
    return (
      <Gate title="はじめての準備">
        <p className="gate-lead">
          管理画面を開くためのマスターパスワードを決めます。マスターパスワードはどこにも送らず、管理者にも分かりません。
        </p>
        <NewPassword submitLabel="次へ" busy={busy} onSubmit={(p) => void prepare(p)} />
        <ErrorText>{problem}</ErrorText>
      </Gate>
    )
  }

  return (
    <Gate title="アカウント復旧のためのキーを控える">
      <p className="gate-lead">
        マスターパスワードを忘れたときは、この復旧キーで管理画面を開きます。この画面でしか見せないので、紙に書くなどして、パソコンの外に控えてください。
      </p>
      <code className="recovery-key">{prepared.recoveryKey}</code>
      <p className="notice notice-warn">
        マスターパスワードと復旧キーの両方を失うと、データは誰にも戻せません。
      </p>
      <form className="form" onSubmit={(e) => void commit(e)}>
        <Field
          label="控えたことの確かめ: 復旧キーの最後の 4 文字"
          value={tail}
          onChange={setTail}
          type="text"
          autoFocus
          disabled={busy}
        />
        <ErrorText>{problem}</ErrorText>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? '準備しています…' : '準備を終える'}
        </button>
      </form>
    </Gate>
  )
}
