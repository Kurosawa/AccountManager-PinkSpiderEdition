// マスターパスワードの変更(PRD 5.2)。変えると、ほかの端末のセッションは切れる
import { useState } from 'react'
import { changeMasterPassword } from '../../vault/flows.ts'
import { ErrorText, Field, nextPaint, StatusText } from '../common.tsx'
import { NewPassword } from '../NewPassword.tsx'
import { useSectionAction, type SectionProps } from './action.ts'

export function ChangePassword(props: SectionProps) {
  const [current, setCurrent] = useState('')
  // 変えたら 1 つ進め、新しいパスワードの欄を作り直して空にする
  const [round, setRound] = useState(0)
  const { busy, message, problem, run, reject } = useSectionAction(props.onLock)

  const submit = (next: string) => {
    if (!current) return reject('今のマスターパスワードを入れてください')
    void run(async () => {
      await nextPaint()
      props.onChange(await changeMasterPassword(props.vault, current, next))
      setCurrent('')
      setRound((n) => n + 1)
      return 'マスターパスワードを変えました。ほかの端末で開いている管理画面は閉じます'
    })
  }

  return (
    <section className="settings-section" aria-labelledby="set-password">
      <h3 id="set-password">マスターパスワードの変更</h3>
      <p className="section-lead">
        変えると、ほかの端末で開いている管理画面は閉じます。復旧キーはそのまま使えます。
      </p>
      <NewPassword
        key={round}
        submitLabel="変える"
        busy={busy}
        onSubmit={submit}
        before={
          <Field
            label="今のマスターパスワード"
            value={current}
            onChange={setCurrent}
            disabled={busy}
          />
        }
      />
      <StatusText>{message}</StatusText>
      <ErrorText>{problem}</ErrorText>
    </section>
  )
}
