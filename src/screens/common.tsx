// 画面で共通に使う小さな部品(見た目は src/app.css。方向性は .impeccable/surfaces の取り決め)
import { useId, type ReactNode } from 'react'
import { ApiError } from '../vault/api.ts'
import { AlertIcon, CheckIcon, KeyIcon } from './icons.tsx'

export function Field(props: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'password' | 'text'
  /** スマホのキーボードの種類(数を入れる欄は decimal) */
  inputMode?: 'decimal'
  hint?: ReactNode
  autoFocus?: boolean
  disabled?: boolean
  /** 既定は off(ブラウザに覚えさせない)。パスキーの候補を出す欄だけ変える(Dev Spec 17 章) */
  autoComplete?: string
}) {
  const id = useId()
  const hintId = useId()
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="input"
        type={props.type ?? 'password'}
        inputMode={props.inputMode}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete ?? 'off'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={props.autoFocus}
        disabled={props.disabled}
        aria-describedby={props.hint ? hintId : undefined}
      />
      {props.hint && (
        <p className="field-hint" id={hintId}>
          {props.hint}
        </p>
      )}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="notice notice-error" role="alert">
      <AlertIcon />
      <span>{children}</span>
    </p>
  )
}

export function StatusText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="notice notice-ok" role="status">
      <CheckIcon />
      <span>{children}</span>
    </p>
  )
}

/** 開く前の画面(管理画面を開く・はじめての準備・アカウントの復旧)の枠 */
export function Gate(props: { title: string; children: ReactNode }) {
  return (
    <main className="gate">
      <p className="gate-brand">
        <KeyIcon />
        AccountManager
      </p>
      <section className="gate-card" aria-labelledby="gate-title">
        <h1 id="gate-title">{props.title}</h1>
        {props.children}
      </section>
    </main>
  )
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

/** API の失敗を、画面に出す文にする */
export function describeFailure(e: unknown, wrongSecret: string): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'wrong_secret':
        return wrongSecret
      case 'locked':
        return `続けて間違えたため、${e.lockedUntil ? formatTime(e.lockedUntil) : 'しばらく'} まで待ってください`
      case 'invalid_session':
        return '時間が切れました。はじめからやり直してください'
      case 'vault_exists':
        return 'ほかの端末で準備が終わりました。読み込み直してください'
      case 'network':
        return '通信できませんでした。つながりを確かめてください'
      case 'unauthorized':
        return 'ログインが切れました。読み込み直してください'
      default:
        return `うまくいきませんでした(${e.status})`
    }
  }
  return 'うまくいきませんでした'
}

/** 重い計算(Argon2id)の前に、画面に「計算中」を描かせる */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}
