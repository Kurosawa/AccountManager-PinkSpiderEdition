// アカウントの復旧(Dev Spec 5.3)。復旧キーを確かめたら、新しいマスターパスワードを決める
import { useState, type FormEvent } from 'react'
import {
  finishRecovery,
  startRecovery,
  type OpenVault,
  type RecoveryInProgress,
  type VaultInfo,
} from '../vault/flows.ts'
import { describeFailure, ErrorText, Field, Gate, nextPaint } from './common.tsx'
import { NewPassword } from './NewPassword.tsx'

export function Recover(props: {
  info: VaultInfo
  onOpen: (vault: OpenVault) => void
  onCancel: () => void
}) {
  const [key, setKey] = useState('')
  const [recovery, setRecovery] = useState<RecoveryInProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const check = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      const r = await startRecovery(props.info, key)
      if (!r) setProblem('復旧キーの形が違います(32 文字の英数字)')
      else setRecovery(r)
    } catch (err) {
      setProblem(describeFailure(err, '復旧キーが違います'))
    } finally {
      setBusy(false)
    }
  }

  const finish = async (password: string) => {
    if (!recovery) return
    setBusy(true)
    setProblem(null)
    try {
      await nextPaint()
      props.onOpen(await finishRecovery(recovery, password))
    } catch (err) {
      setProblem(describeFailure(err, ''))
      setBusy(false)
    }
  }

  if (!recovery) {
    return (
      <Gate title="アカウントの復旧">
        <form className="form" onSubmit={(e) => void check(e)}>
          <Field
            label="復旧キー"
            value={key}
            onChange={setKey}
            type="text"
            autoFocus
            disabled={busy}
            hint="はじめての準備のときに控えた 32 文字。区切りの「-」や、大文字・小文字は問いません"
          />
          <ErrorText>{problem}</ErrorText>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !key.trim()}
          >
            {busy ? '確かめています…' : '次へ'}
          </button>
        </form>
        <p className="gate-foot">
          <button type="button" className="btn btn-quiet" onClick={props.onCancel} disabled={busy}>
            管理画面を開く画面に戻る
          </button>
        </p>
      </Gate>
    )
  }

  return (
    <Gate title="新しいマスターパスワードを決める">
      <p className="gate-lead">
        決めると、ほかの端末で開いている管理画面は閉じます。復旧キーはそのまま使えます。10
        分のうちに決めてください。
      </p>
      <NewPassword submitLabel="決めて開く" busy={busy} onSubmit={(p) => void finish(p)} />
      <ErrorText>{problem}</ErrorText>
    </Gate>
  )
}
