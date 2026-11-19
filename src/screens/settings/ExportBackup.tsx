// バックアップを書き出す(Dev Spec 14 章)。暗号のまま 1 つのファイルにし、最後に書き出した日を設定に残す
import { useState, type FormEvent } from 'react'
import { createBackup, downloadText } from '../../vault/backup.ts'
import { localDate } from '../../vault/entry.ts'
import { saveSettings } from '../../vault/flows.ts'
import { ErrorText, Field, nextPaint, StatusText } from '../common.tsx'
import { useSectionAction, type SectionProps } from './action.ts'

export function ExportBackup(props: SectionProps) {
  const [current, setCurrent] = useState('')
  const { busy, message, problem, run, reject } = useSectionAction(props.onLock)
  const last = props.vault.settings.lastBackupAt
  const lastDate = last ? localDate(last) : null

  const exportFile = (e: FormEvent) => {
    e.preventDefault()
    if (!current) return reject('今のマスターパスワードを入れてください')
    void run(async () => {
      await nextPaint()
      const { file, text, filename } = await createBackup(props.vault, current)
      downloadText(text, filename)
      setCurrent('')
      const done = `${filename} を書き出しました(${file.entries.length} 件)`
      try {
        props.onChange(
          await saveSettings(props.vault, {
            ...props.vault.settings,
            lastBackupAt: file.exportedAt,
          }),
        )
        return done
      } catch {
        // ファイルは保存できている。最後に書き出した日だけが残らなかった
        return `${done}。最後に書き出した日は記録できませんでした`
      }
    })
  }

  return (
    <section className="settings-section" aria-labelledby="set-export">
      <h3 id="set-export">バックアップを書き出す</h3>
      <p className="section-lead">
        登録したサービスを、暗号のまま 1
        つのファイルに書き出します。開くには、書き出したときのマスターパスワードか復旧キーが要ります。ファイルは、自分しか見られない場所に置いてください。
      </p>
      <p className="section-lead">
        {lastDate ? (
          <>
            最後に書き出した日 <span className="num">{lastDate}</span>
          </>
        ) : (
          'まだ書き出していません'
        )}
      </p>
      <form className="form" onSubmit={exportFile}>
        <Field
          label="今のマスターパスワード"
          value={current}
          onChange={setCurrent}
          disabled={busy}
        />
        <div className="actions">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '書き出しています…' : '書き出す'}
          </button>
        </div>
      </form>
      <StatusText>{message}</StatusText>
      <ErrorText>{problem}</ErrorText>
    </section>
  )
}
