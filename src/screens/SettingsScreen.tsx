// 設定(PRD 5.2)。区切りごとの部品は settings/ にある。
// 自動で閉じる時間・ドルのレート・マスターパスワードの変更・復旧キーの作り直し・パスキー(Dev Spec 17 章)・
// バックアップ(14 章)・ほかのアプリからの取り込み(16 章)・全データの削除
import type { Entry } from '../vault/entry.ts'
import type { OpenVault } from '../vault/flows.ts'
import { AutoLock } from './settings/AutoLock.tsx'
import { ChangePassword } from './settings/ChangePassword.tsx'
import { DeleteAll } from './settings/DeleteAll.tsx'
import { ExportBackup } from './settings/ExportBackup.tsx'
import { ImportBackup } from './settings/ImportBackup.tsx'
import { ImportCsv } from './settings/ImportCsv.tsx'
import { Passkeys } from './settings/Passkeys.tsx'
import { RecoveryKey } from './settings/RecoveryKey.tsx'
import { UsdJpyRate } from './settings/UsdJpyRate.tsx'

export function SettingsScreen(props: {
  vault: OpenVault
  onChange: (v: OpenVault) => void
  onDeleted: () => void
  onLock: () => void
  /** 今の管理画面にある件の ID(一覧を読み込む前は null) */
  entryIds: ReadonlySet<string> | null
  /** 今の管理画面にある件(一覧を読み込む前は null。取り込みで同じ件を見分ける) */
  entries: readonly Entry[] | null
  /** バックアップ・CSV から件を足したとき(一覧を読み込み直す) */
  onImported: () => void
}) {
  const { vault, onChange, onLock } = props
  return (
    <section className="stack">
      <header className="detail-head">
        <h2>設定</h2>
      </header>
      <AutoLock vault={vault} onChange={onChange} onLock={onLock} />
      <UsdJpyRate vault={vault} onChange={onChange} onLock={onLock} />
      <ChangePassword vault={vault} onChange={onChange} onLock={onLock} />
      <RecoveryKey vault={vault} onLock={onLock} />
      <Passkeys vault={vault} onLock={onLock} />
      <ExportBackup vault={vault} onChange={onChange} onLock={onLock} />
      <ImportBackup
        vault={vault}
        entryIds={props.entryIds}
        onImported={props.onImported}
        onLock={onLock}
      />
      <ImportCsv
        vault={vault}
        entries={props.entries}
        onImported={props.onImported}
        onLock={onLock}
      />
      <DeleteAll vault={vault} onDeleted={props.onDeleted} onLock={onLock} />
    </section>
  )
}
