// 自動で閉じるまでの時間(Dev Spec 5.5)
import { useState, type FormEvent } from 'react'
import { saveSettings } from '../../vault/flows.ts'
import { AUTO_LOCK_CHOICES, type AutoLockMinutes } from '../../vault/settings.ts'
import { ErrorText, StatusText } from '../common.tsx'
import { useSectionAction, type SectionProps } from './action.ts'

export function AutoLock(props: SectionProps) {
  const [minutes, setMinutes] = useState<AutoLockMinutes>(props.vault.settings.autoLockMinutes)
  const { busy, message, problem, run } = useSectionAction(props.onLock)

  const save = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      props.onChange(
        await saveSettings(props.vault, { ...props.vault.settings, autoLockMinutes: minutes }),
      )
      return '保存しました'
    })
  }

  return (
    <section className="settings-section" aria-labelledby="set-autolock">
      <h3 id="set-autolock">自動で閉じるまでの時間</h3>
      <form className="form" onSubmit={save}>
        <fieldset>
          <legend className="visually-hidden">自動で閉じるまでの時間</legend>
          {AUTO_LOCK_CHOICES.map((m) => (
            <label key={m} className="radio">
              <input
                type="radio"
                name="auto-lock"
                checked={minutes === m}
                onChange={() => setMinutes(m)}
              />
              {m} 分
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || minutes === props.vault.settings.autoLockMinutes}
          >
            {busy ? '保存しています…' : '保存する'}
          </button>
        </div>
        <StatusText>{message}</StatusText>
        <ErrorText>{problem}</ErrorText>
      </form>
    </section>
  )
}
