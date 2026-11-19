// ほかのアプリ(Chrome・Safari)が書き出した CSV からの取り込み(Dev Spec 16 章・discussion32)。
// 読む → 足す件数を見せる → 取り込む、の 2 段。押したボタンが消えるので、次に読むところへフォーカスを移す(discussion33 の 1)
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  CsvFormatError,
  MAX_CSV_FILE_BYTES,
  planImport,
  runImport,
  SOURCE_LABEL,
  SOURCE_TAG,
  type ImportPlan,
} from '../../vault/csv-import.ts'
import type { Entry } from '../../vault/entry.ts'
import { nextPaint, ErrorText, StatusText } from '../common.tsx'
import { AlertIcon } from '../icons.tsx'
import { useFocusRequest, useSectionAction, type SectionProps } from './action.ts'
import { PARTIAL_IMPORT } from './ImportBackup.tsx'

/** 取り込む前に見せる件数(0 件の項目は出さない) */
export function planCounts(p: ImportPlan): string[] {
  const lines = [`足す: ${p.drafts.length} 件`]
  if (p.duplicates) lines.push(`今の管理画面にあるのでとばす: ${p.duplicates} 件`)
  if (p.notLogin) lines.push(`アカウント名もパスワードも無いので取り込まない: ${p.notLogin} 件`)
  if (p.unreadable) lines.push(`読めない行: ${p.unreadable} 件`)
  if (p.twoFactorDropped) {
    lines.push(
      `二段階認証の鍵は取り込みません。${p.twoFactorDropped} 件に「二段階認証あり(認証アプリ)」の印だけを付けます`,
    )
  }
  return lines
}

export function ImportCsv(
  props: Pick<SectionProps, 'vault' | 'onLock'> & {
    entries: readonly Entry[] | null
    onImported: () => void
  },
) {
  const fileId = useId()
  const [file, setFile] = useState<File | null>(null)
  // ファイルを選び直したら、選ぶ欄を作り直して前の選択を消す
  const [inputKey, setInputKey] = useState(0)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  // CSV を読んだあと、消すようお願いするか(取り込んだあと)
  const [askDelete, setAskDelete] = useState(false)
  const { busy, message, problem, run, reject, fail } = useSectionAction(props.onLock)

  const planRef = useRef<HTMLParagraphElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [focusTo, focusSeq, askFocus] = useFocusRequest<'plan' | 'result' | 'file'>()
  useEffect(() => {
    if (!focusTo) return
    const el = { plan: planRef, result: resultRef, file: fileRef }[focusTo].current
    el?.focus()
  }, [focusTo, focusSeq])

  const reset = () => {
    setPlan(null)
    setFile(null)
    setInputKey((k) => k + 1)
  }

  const read = (e: FormEvent) => {
    e.preventDefault()
    setAskDelete(false)
    if (!file) return reject('CSV のファイルを選んでください')
    const { entries } = props
    if (!entries) return reject('一覧を読み込んでから、もう一度行ってください')
    if (file.size > MAX_CSV_FILE_BYTES) return reject('ファイルが大きすぎます')
    void run(
      async () => {
        await nextPaint()
        setPlan(planImport(await file.text(), entries))
        askFocus('plan')
      },
      (err) =>
        err instanceof CsvFormatError
          ? 'Chrome か Safari が書き出した CSV のファイルではないか、ファイルが壊れています'
          : 'ファイルを読めませんでした',
    )
  }

  const importAll = () => {
    if (!plan) return
    void run(
      async () => {
        let added = 0
        try {
          const result = await runImport(props.vault, plan.drafts, (done, total) =>
            setProgress(`取り込んでいます… ${done} / ${total} 件`),
          )
          added = result.added
          setAskDelete(true)
          const parts = [`${result.added} 件を足しました`]
          if (result.stoppedAtLimit) {
            parts.push('登録できる件数の上限に達したので、途中で止めました')
          }
          return parts.join('。')
        } finally {
          setProgress(null)
          reset()
          askFocus('result')
          if (added > 0) props.onImported()
        }
      },
      (err) => {
        const text = fail(err)
        return text && `${text}。${PARTIAL_IMPORT}`
      },
    )
  }

  return (
    <section className="settings-section" aria-labelledby="set-csv">
      <h3 id="set-csv">ほかのアプリから取り込む</h3>
      <p className="section-lead">
        Chrome か Safari が書き出したパスワードの CSV
        から、まとめて登録します。今の管理画面にある件(URL
        とアカウント名が同じもの)はとばします。取り込む前に、上の「バックアップを書き出す」で書き出しておくと安心です。
      </p>
      {!plan ? (
        <form className="form" onSubmit={read}>
          <div className="field">
            <label className="field-label" htmlFor={fileId}>
              CSV のファイル
            </label>
            <input
              key={inputKey}
              ref={fileRef}
              id={fileId}
              className="input-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </div>
          <div className="actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? '読んでいます…' : '読み込む'}
            </button>
          </div>
        </form>
      ) : (
        <div className="form">
          <p className="section-lead focus-target" ref={planRef} tabIndex={-1}>
            {plan.drafts.length > 0
              ? `${SOURCE_LABEL[plan.source]} の CSV です。足す件には、タグ「${SOURCE_TAG[plan.source]}」を付けます。`
              : `${SOURCE_LABEL[plan.source]} の CSV です。足すものはありません。`}
          </p>
          <ul className="import-counts">
            {planCounts(plan).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {plan.drafts.length > 0 && (
            <details className="import-preview">
              <summary>足す件の一覧({plan.drafts.length} 件)</summary>
              {/* 長いと枠の中で縦に送るので、キーボードでも選べるようにする(discussion33 の 4) */}
              <ul tabIndex={0} aria-label="足す件の一覧">
                {plan.drafts.map((d, i) => (
                  // 取り込む前の下書きには ID が無く、並びは読んだあと変わらないので、順番を鍵にする
                  // oxlint-disable-next-line react/no-array-index-key
                  <li key={i}>
                    <span className="import-name">{d.serviceName}</span>
                    {d.accountName && <span className="import-account">{d.accountName}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="actions">
            {plan.drafts.length > 0 && (
              <button type="button" className="btn" disabled={busy} onClick={importAll}>
                {busy ? '取り込んでいます…' : '取り込む'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => {
                reset()
                askFocus('file')
              }}
            >
              やめる
            </button>
          </div>
        </div>
      )}
      {progress && (
        <p className="section-lead" role="status">
          {progress}
        </p>
      )}
      <div className="section-result focus-target" ref={resultRef} tabIndex={-1}>
        <StatusText>{message}</StatusText>
        <ErrorText>{problem}</ErrorText>
        {askDelete && (
          // 足した件数(緑)と分けて、目に留まるようにする(discussion33 の 2)
          <p className="notice notice-warn">
            <AlertIcon />
            <span>
              読み込んだ CSV
              のファイルは暗号になっていません。端末から消し、ゴミ箱も空にしてください
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
