// 設定の各区切りで使う、押したときの処理の決まった形(処理中・済んだ知らせ・誤り)
import { useCallback, useState } from 'react'
import { ApiError } from '../../vault/api.ts'
import type { OpenVault } from '../../vault/flows.ts'
import { describeFailure } from '../common.tsx'

export const WRONG_CURRENT = '今のマスターパスワードが違います'

/** 区切りが受け取る値。onChange は設定を保存したあとの金庫を渡す */
export interface SectionProps {
  vault: OpenVault
  onChange: (v: OpenVault) => void
  onLock: () => void
}

/** セッションが切れていたら金庫を閉じて null。そうでなければ画面に出す文を返す */
export function describeSettingsFailure(e: unknown, onLock: () => void): string | null {
  if (e instanceof ApiError && e.code === 'invalid_session') {
    onLock()
    return null
  }
  if (e instanceof ApiError && e.code === 'version_conflict') {
    return 'ほかの端末で設定が変わっています。管理画面を閉じて開き直してから、もう一度行ってください'
  }
  return describeFailure(e, WRONG_CURRENT)
}

/**
 * 区切りの中の処理を 1 つずつ動かす。動かす前に前の知らせと誤りを消し、動いている間は busy にする。
 * task が文を返せば済んだ知らせに出す。失敗したら、explain が返す文(undefined なら決まった文)を誤りに出す
 */
export function useSectionAction(onLock: () => void) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const fail = useCallback((e: unknown) => describeSettingsFailure(e, onLock), [onLock])

  const run = useCallback(
    async (
      task: () => Promise<string | null | void>,
      explain?: (e: unknown) => string | null | undefined,
    ) => {
      setBusy(true)
      setMessage(null)
      setProblem(null)
      try {
        const done = await task()
        if (typeof done === 'string') setMessage(done)
      } catch (err) {
        const text = explain?.(err)
        setProblem(text === undefined ? fail(err) : text)
      } finally {
        setBusy(false)
      }
    },
    [fail],
  )

  /** 送る前の確かめに通らなかったときなど。前の知らせを消して、誤りだけを出す(null なら何も出さない) */
  const reject = useCallback((text: string | null) => {
    setMessage(null)
    setProblem(text)
  }, [])

  const clear = useCallback(() => {
    setMessage(null)
    setProblem(null)
  }, [])

  return { busy, message, problem, run, reject, clear, fail }
}

/** フォーカスを移す先の依頼。依頼を変えた描画のあとにだけ、呼ぶ側の useEffect が動く */
export function useFocusRequest<T extends string>() {
  const [request, setRequest] = useState<{ to: T; seq: number } | null>(null)
  const ask = useCallback((to: T) => setRequest((r) => ({ to, seq: (r?.seq ?? 0) + 1 })), [])
  return [request?.to ?? null, request?.seq ?? 0, ask] as const
}
