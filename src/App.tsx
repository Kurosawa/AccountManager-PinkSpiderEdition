// 画面の切り替え(読み込み中・金庫の作成・開ける・回復・開いた金庫)。
// 開いた金庫(鍵・トークン)は、この部品の状態としてメモリだけに持つ。閉じたら捨てる(Dev Spec 3.4・5.5)
import { useCallback, useEffect, useState } from 'react'
import { CreateVault } from './screens/CreateVault.tsx'
import { describeFailure, ErrorText, Gate } from './screens/common.tsx'
import { Recover } from './screens/Recover.tsx'
import { Unlock } from './screens/Unlock.tsx'
import { useAutoLock } from './vault/auto-lock.ts'
import { clearClipboardNow } from './vault/clipboard.ts'
import { endSession, fetchMe, type OpenVault, type VaultInfo } from './vault/flows.ts'
import { VaultHome } from './screens/VaultHome.tsx'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'create'; userId: string }
  | { kind: 'unlock'; info: VaultInfo }
  | { kind: 'recover'; info: VaultInfo }
  | { kind: 'open'; vault: OpenVault }

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  // 読み込み直すたびに 1 つ増やす(閉じたあと、/api/me から金庫の状態を取り直す)
  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchMe().then(
      (me) => {
        if (cancelled) return
        setState(
          me.vault ? { kind: 'unlock', info: me.vault } : { kind: 'create', userId: me.userId },
        )
      },
      (e: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: describeFailure(e, '') })
      },
    )
    return () => {
      cancelled = true
    }
  }, [loadCount])

  const open = state.kind === 'open' ? state.vault : null
  const lock = useCallback(() => {
    if (open) void endSession(open.token)
    // コピーしたパスワードが残っていれば消す(Dev Spec 9.3)
    void clearClipboardNow()
    setState({ kind: 'loading' })
    setLoadCount((n) => n + 1)
  }, [open])

  useAutoLock(open?.settings.autoLockMinutes ?? 5, lock, open !== null)

  const onOpen = (vault: OpenVault) => setState({ kind: 'open', vault })

  switch (state.kind) {
    case 'loading':
      return (
        <main className="loading" aria-busy="true">
          読み込み中…
        </main>
      )
    case 'error':
      return (
        <Gate title="AccountManager">
          <ErrorText>{state.message}</ErrorText>
        </Gate>
      )
    case 'create':
      return <CreateVault userId={state.userId} onOpen={onOpen} />
    case 'unlock':
      return (
        <Unlock
          info={state.info}
          onOpen={onOpen}
          onRecover={() => setState({ kind: 'recover', info: state.info })}
        />
      )
    case 'recover':
      return (
        <Recover
          info={state.info}
          onOpen={onOpen}
          onCancel={() => setState({ kind: 'unlock', info: state.info })}
        />
      )
    case 'open':
      return (
        <VaultHome
          vault={state.vault}
          onLock={lock}
          onVaultChange={(vault) => setState({ kind: 'open', vault })}
          onDeleted={() => {
            void clearClipboardNow()
            setState({ kind: 'loading' })
            setLoadCount((n) => n + 1)
          }}
        />
      )
  }
}
