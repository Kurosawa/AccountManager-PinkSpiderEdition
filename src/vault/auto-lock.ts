// さわらないと金庫を閉じる(Dev Spec 5.5)。最後の操作(押す・打つ・スクロール)から数える。
// タブが隠れている間も時刻で数える(タイマーが止められても、戻ったときに時刻で判断する)
import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const
const CHECK_INTERVAL_MS = 5_000

export function useAutoLock(minutes: number, onLock: () => void, enabled = true) {
  const lastActivity = useRef(0)
  const onLockRef = useRef(onLock)
  useEffect(() => {
    onLockRef.current = onLock
  }, [onLock])

  useEffect(() => {
    if (!enabled) return
    lastActivity.current = Date.now()
    const limit = minutes * 60_000
    const touch = () => {
      lastActivity.current = Date.now()
    }
    const check = () => {
      if (Date.now() - lastActivity.current >= limit) onLockRef.current()
    }
    for (const e of ACTIVITY_EVENTS)
      window.addEventListener(e, touch, { passive: true, capture: true })
    document.addEventListener('visibilitychange', check)
    const timer = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, touch, { capture: true })
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(timer)
    }
  }, [minutes, enabled])
}
