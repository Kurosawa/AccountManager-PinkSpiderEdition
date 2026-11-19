// クリップボード(Dev Spec 9.3)。コピーしてから 30 秒で、空の文字列を書き込んで消す。
// タブが前に出ていないと書き込めないので、消せなかったときは、タブが前に戻ったときに消す。金庫を閉じるときにも消す

export const CLEAR_AFTER_MS = 30_000

let timer: ReturnType<typeof setTimeout> | null = null
/** 消す必要が残っているか */
let pending = false

async function tryClear(): Promise<void> {
  try {
    await navigator.clipboard.writeText('')
    pending = false
  } catch {
    pending = true
  }
}

function onFocusBack() {
  if (pending && document.visibilityState === 'visible') void tryClear()
}

let listening = false
function listen() {
  if (listening) return
  listening = true
  document.addEventListener('visibilitychange', onFocusBack)
  window.addEventListener('focus', onFocusBack)
}

/** コピーし、30 秒後に消す。コピーできなければ false */
export async function copySecret(text: string): Promise<boolean> {
  listen()
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return false
  }
  pending = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void tryClear()
  }, CLEAR_AFTER_MS)
  return true
}

/** 金庫を閉じるときに呼ぶ。コピーしたものが残っていれば消す */
export async function clearClipboardNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (pending) await tryClear()
}
