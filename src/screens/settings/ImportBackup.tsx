// バックアップを読み込む(Dev Spec 14 章)。今の管理画面に無い件だけを足し、今ある件と設定は変えない
import { useId, useState, type FormEvent } from 'react'
import {
  BackupFormatError,
  BackupSecretError,
  importBackup,
  MAX_BACKUP_FILE_BYTES,
  openBackup,
  parseBackup,
  type ImportResult,
} from '../../vault/backup.ts'
import { ErrorText, Field, nextPaint, StatusText } from '../common.tsx'
import { useSectionAction, type SectionProps } from './action.ts'

/** 途中で止まったときに添える文 */
export const PARTIAL_IMPORT =
  '途中まで足した件は残っています。もう一度読み込むと、残りの件だけを足します'

export function describeImport(r: ImportResult): string {
  // 0 件のときは「0 件を足しました」と言わない(discussion28)
  if (r.added === 0 && r.skipped > 0 && !r.unreadable && !r.stoppedAtLimit) {
    return `足したものはありませんでした。${r.skipped} 件はすべて今の管理画面にありました`
  }
  const parts = [r.added === 0 ? '足したものはありませんでした' : `${r.added} 件を足しました`]
  if (r.skipped) parts.push(`${r.skipped} 件は今の管理画面にあったので、今のままにしました`)
  if (r.unreadable) parts.push(`${r.unreadable} 件はファイルの中で読めませんでした`)
  if (r.stoppedAtLimit) parts.push('登録できる件数の上限に達したので、途中で止めました')
  return parts.join('。')
}

export function ImportBackup(
  props: Pick<SectionProps, 'vault' | 'onLock'> & {
    entryIds: ReadonlySet<string> | null
    onImported: () => void
  },
) {
  const fileId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<'password' | 'recovery'>('password')
  const [secret, setSecret] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const { busy, message, problem, run, reject, fail } = useSectionAction(props.onLock)
  const secretName = kind === 'password' ? 'マスターパスワード' : '復旧キー'

  const load = (e: FormEvent) => {
    e.preventDefault()
    if (!file) return reject('バックアップのファイルを選んでください')
    if (!secret) return reject(`書き出したときの${secretName}を入れてください`)
    const { entryIds } = props
    if (!entryIds) return reject('一覧を読み込んでから、もう一度行ってください')
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      return reject('ファイルが大きすぎます。AccountManager のバックアップか確かめてください')
    }
    void run(
      async () => {
        setProgress('ファイルを開いています…')
        let added = 0
        try {
          await nextPaint()
          const backup = parseBackup(await file.text())
          const key = await openBackup(backup, { kind, text: secret })
          const result = await importBackup(props.vault, backup, key, entryIds, (done, total) =>
            setProgress(`読み込んでいます… ${done} / ${total} 件`),
          )
          added = result.added
          setSecret('')
          return describeImport(result)
        } finally {
          setProgress(null)
          if (added > 0) props.onImported()
        }
      },
      (err) => {
        if (err instanceof BackupFormatError) {
          return 'AccountManager のバックアップのファイルではないか、ファイルが壊れています'
        }
        if (err instanceof BackupSecretError) {
          return `このファイルを開けませんでした。書き出したときの${secretName}を入れてください`
        }
        const text = fail(err)
        return text && `${text}。${PARTIAL_IMPORT}`
      },
    )
  }

  return (
    <section className="settings-section" aria-labelledby="set-import">
      <h3 id="set-import">バックアップを読み込む</h3>
      <p className="section-lead">
        書き出したファイルから、今の管理画面に無い件だけを足します。今ある件は書き換えません。設定は戻しません。
      </p>
      <form className="form" onSubmit={load}>
        <div className="field">
          <label className="field-label" htmlFor={fileId}>
            バックアップのファイル
          </label>
          <input
            id={fileId}
            className="input-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </div>
        <fieldset>
          <legend className="field-label">開くのに使うもの</legend>
          <label className="radio">
            <input
              type="radio"
              name="backup-secret"
              checked={kind === 'password'}
              onChange={() => setKind('password')}
              disabled={busy}
            />
            マスターパスワード
          </label>
          <label className="radio">
            <input
              type="radio"
              name="backup-secret"
              checked={kind === 'recovery'}
              onChange={() => setKind('recovery')}
              disabled={busy}
            />
            復旧キー
          </label>
        </fieldset>
        <Field
          label={`書き出したときの${secretName}`}
          value={secret}
          onChange={setSecret}
          type={kind === 'password' ? 'password' : 'text'}
          disabled={busy}
        />
        <div className="actions">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '読み込んでいます…' : '読み込む'}
          </button>
        </div>
      </form>
      {progress && (
        <p className="section-lead" role="status">
          {progress}
        </p>
      )}
      <StatusText>{message}</StatusText>
      <ErrorText>{problem}</ErrorText>
    </section>
  )
}
