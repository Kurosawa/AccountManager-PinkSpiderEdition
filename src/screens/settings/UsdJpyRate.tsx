// ドルを円に換算するレート(discussion53)。外の為替のサービスとは通信しないので、自分で決める
import { useState, type FormEvent } from 'react'
import { saveSettings } from '../../vault/flows.ts'
import { todayLocal } from '../../vault/renewal.ts'
import { MAX_USD_JPY_RATE, parseRateInput } from '../../vault/settings.ts'
import { ErrorText, Field, StatusText } from '../common.tsx'
import { useSectionAction, type SectionProps } from './action.ts'

export function UsdJpyRate(props: SectionProps) {
  const current = props.vault.settings.usdJpyRate
  const [text, setText] = useState(current ? String(current.rate) : '')
  const { busy, message, problem, run, reject } = useSectionAction(props.onLock)
  const rate = parseRateInput(text)

  const store = (next: number | null) =>
    run(async () => {
      const { usdJpyRate: _old, ...rest } = props.vault.settings
      const settings =
        next === null ? rest : { ...rest, usdJpyRate: { rate: next, decidedOn: todayLocal() } }
      props.onChange(await saveSettings(props.vault, settings))
      if (next === null) setText('')
      return next === null ? 'レートを消しました' : '保存しました'
    })

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (rate === null) {
      return reject(
        `1 ドルあたりの円を、0 より大きく ${MAX_USD_JPY_RATE.toLocaleString('ja-JP')} までの数で入れてください(小数は 2 桁まで)`,
      )
    }
    void store(rate)
  }

  return (
    <section className="settings-section" aria-labelledby="set-rate">
      <h3 id="set-rate">ドルを円に換算する</h3>
      <p className="section-lead">
        決めたレートで、一覧の上の月あたりの課金を、円にまとめた額でも出します。為替のサービスとは通信しないので、レートは自分で決め直してください。
      </p>
      <form className="form" onSubmit={save}>
        <Field
          label="1 ドルあたりの円"
          type="text"
          inputMode="decimal"
          value={text}
          onChange={setText}
          disabled={busy}
          hint={
            current ? (
              <>
                今は 1 ドル = <span className="num">{current.rate}</span> 円(
                <span className="num">{current.decidedOn}</span> に決めた)
              </>
            ) : (
              '例: 150(小数は 2 桁まで)'
            )
          }
        />
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ''}>
            {busy ? '保存しています…' : '保存する'}
          </button>
          {current && (
            <button type="button" className="btn" onClick={() => void store(null)} disabled={busy}>
              レートを消す
            </button>
          )}
        </div>
        <StatusText>{message}</StatusText>
        <ErrorText>{problem}</ErrorText>
      </form>
    </section>
  )
}
