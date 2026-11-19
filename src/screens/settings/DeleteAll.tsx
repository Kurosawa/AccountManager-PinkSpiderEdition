// 自分のデータをすべて消す(PRD 5.2)。確かめの印 → 赤い確かめの段の 2 段で行う
import { useState, type FormEvent } from 'react'
import { deleteAllData } from '../../vault/flows.ts'
import { ErrorText, Field, nextPaint } from '../common.tsx'
import { useSectionAction, type SectionProps } from './action.ts'

export function DeleteAll(
  props: Pick<SectionProps, 'vault' | 'onLock'> & { onDeleted: () => void },
) {
  const [current, setCurrent] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { busy, problem, run, reject, clear } = useSectionAction(props.onLock)

  const first = (e: FormEvent) => {
    e.preventDefault()
    if (!current) return reject('今のマスターパスワードを入れてください')
    if (!understood) return reject('確かめの印を付けてください')
    clear()
    setConfirming(true)
  }

  const erase = () =>
    run(
      async () => {
        await nextPaint()
        await deleteAllData(props.vault, current)
        props.onDeleted()
      },
      () => {
        // 確かめの段を閉じて、決まった文で誤りを出す
        setConfirming(false)
        return undefined
      },
    )

  return (
    <section className="settings-section is-danger" aria-labelledby="set-delete">
      <h3 id="set-delete">自分のデータをすべて消す</h3>
      <p className="section-lead">
        登録したサービス・設定・マスターパスワード・復旧キーをすべて消します。元には戻せません。
      </p>
      {!confirming ? (
        <form className="form" onSubmit={first}>
          <Field
            label="今のマスターパスワード"
            value={current}
            onChange={setCurrent}
            disabled={busy}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            すべてのデータが消え、元に戻せないことを分かっています
          </label>
          <div className="actions">
            <button type="submit" className="btn btn-danger">
              消す
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="notice notice-error" role="alert">
            本当にすべて消しますか?
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => void erase()}
              disabled={busy}
            >
              {busy ? '消しています…' : 'すべて消す'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              やめる
            </button>
          </div>
        </>
      )}
      <ErrorText>{problem}</ErrorText>
    </section>
  )
}
