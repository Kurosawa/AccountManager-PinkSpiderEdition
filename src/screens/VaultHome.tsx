// 管理画面(上の帯・一覧の面・詳細の面。詳細の面には詳細・新規・編集・設定を出す)。復号した件はこの部品の状態としてメモリだけに持ち、
// 金庫を閉じたら部品ごと捨てる(Dev Spec 3.4)
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '../vault/api.ts'
import type { Draft } from '../vault/entry-draft.ts'
import { addEntry, deleteEntry, loadEntries, updateEntry, type Item } from '../vault/entries.ts'
import type { OpenVault } from '../vault/flows.ts'
import { describeFailure, ErrorText } from './common.tsx'
import { BackIcon, GearIcon, KeyIcon, LockIcon } from './icons.tsx'
import { EntryDetail } from './EntryDetail.tsx'
import { EntryForm } from './EntryForm.tsx'
import { EntryList } from './EntryList.tsx'
import { SettingsScreen } from './SettingsScreen.tsx'

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'settings' }

type Data =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: Item[]; unreadable: number }

const CONFLICT = 'ほかの端末で更新されています。読み込み直してから、もう一度行ってください'

export function VaultHome(props: {
  vault: OpenVault
  onLock: () => void
  /** 設定・マスターパスワードを変えたとき */
  onVaultChange: (vault: OpenVault) => void
  /** 全データを消したとき */
  onDeleted: () => void
}) {
  const { vault, onLock } = props
  const [data, setData] = useState<Data>({ kind: 'loading' })
  const [view, setView] = useState<View>({ kind: 'list' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ text: string; conflict: boolean } | null>(null)
  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadEntries(vault).then(
      (loaded) => {
        if (!cancelled) setData({ kind: 'ready', ...loaded })
      },
      (e: unknown) => {
        if (cancelled) return
        if (e instanceof ApiError && e.code === 'invalid_session') onLock()
        else setData({ kind: 'error', message: describeFailure(e, '') })
      },
    )
    return () => {
      cancelled = true
    }
  }, [vault, onLock, loadCount])

  const reload = () => {
    setProblem(null)
    setView({ kind: 'list' })
    setData({ kind: 'loading' })
    setLoadCount((n) => n + 1)
  }

  /** 保存・削除の失敗。セッションが切れていたら金庫を閉じる */
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'invalid_session') return onLock()
      const conflict = e instanceof ApiError && e.code === 'version_conflict'
      const text = conflict
        ? CONFLICT
        : e instanceof ApiError && e.code === 'limit_reached'
          ? '登録できる件数の上限に達しました'
          : describeFailure(e, '')
      setProblem({ text, conflict })
    },
    [onLock],
  )

  const go = (next: View) => {
    setProblem(null)
    setView(next)
  }

  /** 上の帯と、一覧・詳細の 2 つの面。スマホでは data-view で片方だけを出す(app.css) */
  const shell = (list: ReactNode, detail: ReactNode) => (
    <div className="app">
      <header className="topbar">
        <span className="topbar-brand" aria-label="AccountManager">
          <KeyIcon />
          <span className="topbar-name">AccountManager</span>
        </span>
        <span className="topbar-status">
          {vault.settings.autoLockMinutes} 分さわらないと自動で閉じます
        </span>
        <button
          type="button"
          className="btn btn-quiet btn-small grow"
          onClick={() => go({ kind: 'settings' })}
          aria-current={view.kind === 'settings' ? 'page' : undefined}
          aria-label="設定"
        >
          <GearIcon />
          {/* スマホではアイコンだけにし、帯の名前を全部出す(読み上げは aria-label) */}
          <span className="btn-text-wide">設定</span>
        </button>
        <button type="button" className="btn btn-small" onClick={onLock}>
          <LockIcon />
          閉じる
        </button>
      </header>
      <div className="workspace" data-view={view.kind === 'list' ? 'list' : 'detail'}>
        <nav className="pane-list" aria-label="登録したサービス">
          {list}
        </nav>
        <main className="pane-detail">
          <div className="pane-detail-inner">
            <button
              type="button"
              className="btn btn-quiet back"
              onClick={() => go({ kind: 'list' })}
            >
              <BackIcon />
              一覧に戻る
            </button>
            {detail}
          </div>
        </main>
      </div>
    </div>
  )

  if (data.kind === 'loading') {
    return shell(<p className="loading">読み込み中…</p>, null)
  }
  if (data.kind === 'error') {
    return shell(
      <div className="empty">
        <ErrorText>{data.message}</ErrorText>
        <button type="button" className="btn" onClick={reload}>
          読み込み直す
        </button>
      </div>,
      null,
    )
  }

  const items = data.items
  const find = (id: string) => items.find((i) => i.id === id)
  const replace = (next: Item[]) => setData({ ...data, items: next })

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setProblem(null)
    try {
      await task()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const problemNode = problem && (
    <>
      {problem.text}
      {problem.conflict && (
        <>
          {' '}
          <button type="button" className="btn btn-small" onClick={reload}>
            読み込み直す
          </button>
        </>
      )}
    </>
  )

  const selectedId = view.kind === 'detail' || view.kind === 'edit' ? view.id : null
  const list = (
    <EntryList
      items={items}
      unreadable={data.unreadable}
      {...(vault.settings.usdJpyRate ? { rate: vault.settings.usdJpyRate } : {})}
      selectedId={selectedId}
      onOpen={(item) => go({ kind: 'detail', id: item.id })}
      onNew={() => go({ kind: 'new' })}
    />
  )
  const nothingSelected = (
    <div className="empty">
      <p>
        {items.length === 0
          ? 'まだ登録がありません。使っているサービスを登録しましょう。'
          : 'サービスを選ぶと、ここに詳細が出ます。'}
      </p>
    </div>
  )

  switch (view.kind) {
    case 'list':
      return shell(list, nothingSelected)
    case 'settings':
      return shell(
        list,
        <SettingsScreen
          vault={vault}
          onChange={props.onVaultChange}
          onDeleted={props.onDeleted}
          onLock={onLock}
          entryIds={data.kind === 'ready' ? new Set(data.items.map((i) => i.id)) : null}
          entries={data.kind === 'ready' ? data.items.map((i) => i.entry) : null}
          onImported={() => setLoadCount((n) => n + 1)}
        />,
      )
    case 'new':
      return shell(
        list,
        <EntryForm
          busy={busy}
          problem={problemNode}
          onCancel={() => go({ kind: 'list' })}
          onSubmit={(draft: Draft) =>
            void run(async () => {
              const item = await addEntry(vault, draft)
              replace([...items, item])
              setView({ kind: 'detail', id: item.id })
            })
          }
        />,
      )
    case 'detail':
    case 'edit': {
      const item = find(view.id)
      if (!item) return shell(list, nothingSelected)
      if (view.kind === 'edit') {
        return shell(
          list,
          <EntryForm
            key={`${item.id}:${item.version}`}
            initial={item.entry}
            busy={busy}
            problem={problemNode}
            onCancel={() => go({ kind: 'detail', id: item.id })}
            onSubmit={(draft) =>
              void run(async () => {
                const next = await updateEntry(vault, item, draft)
                replace(items.map((i) => (i.id === next.id ? next : i)))
                setView({ kind: 'detail', id: next.id })
              })
            }
          />,
        )
      }
      return shell(
        list,
        <EntryDetail
          key={item.id}
          item={item}
          busy={busy}
          problem={problemNode}
          onEdit={() => go({ kind: 'edit', id: item.id })}
          onAdvanceRenewal={(nextRenewal) =>
            void run(async () => {
              const { createdAt: _c, updatedAt: _u, ...draft } = item.entry
              const billing = draft.billing && { ...draft.billing, nextRenewal }
              const next = await updateEntry(vault, item, {
                ...draft,
                ...(billing ? { billing } : {}),
              })
              replace(items.map((i) => (i.id === next.id ? next : i)))
            })
          }
          onDelete={() =>
            void run(async () => {
              await deleteEntry(vault, item)
              replace(items.filter((i) => i.id !== item.id))
              setView({ kind: 'list' })
            })
          }
        />,
      )
    }
  }
}
