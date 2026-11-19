// 復旧キーの作り直し(PRD 5.2)。新しいキーを見せ、最後の 4 文字で控えたことを確かめてから置き換える
import { useState, type FormEvent } from 'react'
import { recoveryKeyTail } from '../../crypto/recovery-key.ts'
import {
  commitRecoveryKey,
  prepareRecoveryKey,
  type PreparedRecoveryKey,
} from '../../vault/flows.ts'
import { ErrorText, Field, nextPaint, StatusText } from '../common.tsx'
import { useSectionAction, type SectionProps } from './action.ts'

export function RecoveryKey(props: Pick<SectionProps, 'vault' | 'onLock'>) {
  const [current, setCurrent] = useState('')
  const [prepared, setPrepared] = useState<PreparedRecoveryKey | null>(null)
  const [tail, setTail] = useState('')
  const { busy, message, problem, run, reject, clear } = useSectionAction(props.onLock)

  const prepare = (e: FormEvent) => {
    e.preventDefault()
    if (!current) return reject('今のマスターパスワードを入れてください')
    void run(async () => {
      await nextPaint()
      setPrepared(await prepareRecoveryKey(props.vault, current))
      setCurrent('')
    })
  }

  const commit = (e: FormEvent) => {
    e.preventDefault()
    if (!prepared) return
    if (tail.trim().toUpperCase() !== recoveryKeyTail(prepared.recoveryKey)) {
      return reject('最後の 4 文字が違います。控えを見直してください')
    }
    void run(async () => {
      await commitRecoveryKey(props.vault, prepared)
      setPrepared(null)
      setTail('')
      return '復旧キーを作り直しました。古い復旧キーは使えません'
    })
  }

  const cancel = () => {
    setPrepared(null)
    setTail('')
    clear()
  }

  return (
    <section className="settings-section" aria-labelledby="set-recovery">
      <h3 id="set-recovery">復旧キーの作り直し</h3>
      {!prepared ? (
        <form className="form" onSubmit={prepare}>
          <p className="section-lead">新しい復旧キーを作ると、古い復旧キーは使えなくなります。</p>
          <Field
            label="今のマスターパスワード"
            value={current}
            onChange={setCurrent}
            disabled={busy}
          />
          <div className="actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? '作っています…' : '新しい復旧キーを作る'}
            </button>
          </div>
        </form>
      ) : (
        <form className="form" onSubmit={commit}>
          <p className="section-lead">
            新しい復旧キーです。この画面でしか見せないので、紙に書くなどして、パソコンの外に控えてください。控えたことを確かめるまでは、古い復旧キーのままです。
          </p>
          <code className="recovery-key">{prepared.recoveryKey}</code>
          <Field
            label="控えたことの確かめ: 復旧キーの最後の 4 文字"
            value={tail}
            onChange={setTail}
            type="text"
            disabled={busy}
          />
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? '保存しています…' : '作り直す'}
            </button>
            <button type="button" className="btn" onClick={cancel} disabled={busy}>
              やめる
            </button>
          </div>
        </form>
      )}
      <StatusText>{message}</StatusText>
      <ErrorText>{problem}</ErrorText>
    </section>
  )
}
