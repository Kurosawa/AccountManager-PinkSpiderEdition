// 管理画面を開く(Dev Spec 5.2)。パスキーで開く(17 章)と、「復旧キーで開く」への入口もある
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../vault/api.ts'
import { unlockVault, type OpenVault, type VaultInfo } from '../vault/flows.ts'
import {
  conditionalAvailable,
  PasskeyCancelledError,
  passkeysHere,
  PasskeyUnsupportedError,
  unlockWithPasskey,
} from '../vault/passkeys.ts'
import { describeFailure, ErrorText, Field, formatTime, Gate, nextPaint } from './common.tsx'

/** パスキーで開けなかったときの文 */
function passkeyFailure(err: unknown): string | null {
  if (err instanceof PasskeyCancelledError) return null
  if (err instanceof PasskeyUnsupportedError) {
    return 'この端末では、パスキーで開けませんでした。マスターパスワードで開いてください'
  }
  if (err instanceof ApiError && err.code === 'password_due') {
    return 'マスターパスワードを忘れないように、2 週間に 1 回はマスターパスワードで開いていただいています。今回はマスターパスワードで開いてください'
  }
  return describeFailure(
    err,
    'パスキーで開けませんでした(登録を消したパスキーかもしれません)。マスターパスワードで開いてください',
  )
}

export function Unlock(props: {
  info: VaultInfo
  onOpen: (vault: OpenVault) => void
  onRecover: () => void
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(
    props.info.lockedUntil
      ? `続けて間違えたため、${formatTime(props.info.lockedUntil)} まで待ってください`
      : null,
  )
  const passkeys = props.info.passkeys.state
  const canPasskey = passkeys === 'available' && !props.info.lockedUntil
  // ボタンは、この端末で登録した・開けたパスキーがあるときだけ出す。無い端末で押すと、
  // ブラウザが USB キーやスマホを求めて迷うため(discussion43 の 1)。キーボードの候補は、どの端末でも出す
  const [hereIds] = useState(() => {
    const p = props.info.passkeys
    if (p.state !== 'available') return []
    return passkeysHere().filter((id) => p.credentials.some((c) => c.id === id))
  })
  const showButton = canPasskey && hereIds.length > 0
  // キーボードの候補(パスキーの自動入力)。使えるときだけ欄に印を付ける(discussion40 の 2)
  const [conditional, setConditional] = useState(false)
  const conditionalAbort = useRef<AbortController | null>(null)
  const { info } = props
  // 親が描くたびに作り直す関数なので、最新のものを参照で持つ(キーボードの候補の問い合わせを作り直さない)
  const onOpenRef = useRef(props.onOpen)
  useEffect(() => {
    onOpenRef.current = props.onOpen
  })

  useEffect(() => {
    if (!canPasskey) return
    let alive = true
    const abort = new AbortController()
    conditionalAbort.current = abort
    void conditionalAvailable().then((ok) => {
      if (!alive || !ok) return
      setConditional(true)
      unlockWithPasskey(info, { conditional: true, signal: abort.signal })
        .then((vault) => alive && onOpenRef.current(vault))
        .catch((err: unknown) => {
          // 止めた(ボタンを押した・画面を離れた)ときは何も出さない
          if (!alive || abort.signal.aborted) return
          setProblem(passkeyFailure(err))
        })
    })
    return () => {
      alive = false
      abort.abort()
    }
  }, [canPasskey, info])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setProblem(null)
    try {
      await nextPaint()
      props.onOpen(await unlockVault(props.info, password))
    } catch (err) {
      setProblem(describeFailure(err, 'マスターパスワードが違います'))
      setBusy(false)
    }
  }

  const withPasskey = async () => {
    // キーボードの候補を待っている問い合わせを止めてから、新しく問い合わせる(同時には 1 つだけ)
    conditionalAbort.current?.abort()
    setBusy(true)
    setProblem(null)
    try {
      props.onOpen(await unlockWithPasskey(props.info, { only: hereIds }))
    } catch (err) {
      setProblem(passkeyFailure(err))
      setBusy(false)
    }
  }

  return (
    <Gate title="管理画面を開く">
      {passkeys === 'password_due' && (
        <p className="notice notice-info">
          マスターパスワードを忘れないように、2 週間に 1
          回はマスターパスワードで開いていただいています。今回はマスターパスワードで開いてください
        </p>
      )}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <Field
          label="マスターパスワード"
          value={password}
          onChange={setPassword}
          autoFocus
          disabled={busy}
          autoComplete={conditional ? 'current-password webauthn' : undefined}
        />
        <ErrorText>{problem}</ErrorText>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? '開いています…' : '開く'}
        </button>
      </form>
      {showButton && (
        <>
          <p className="gate-or">または</p>
          <button
            type="button"
            className="btn btn-block"
            onClick={() => void withPasskey()}
            disabled={busy}
          >
            パスキーで開く(Face ID など)
          </button>
        </>
      )}
      <p className="gate-foot">
        <button type="button" className="btn btn-quiet" onClick={props.onRecover} disabled={busy}>
          マスターパスワードを忘れたとき(復旧キーで開く)
        </button>
      </p>
    </Gate>
  )
}
