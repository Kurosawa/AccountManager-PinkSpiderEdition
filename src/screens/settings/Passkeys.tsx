// パスキー(discussion38)。登録・一覧・削除。開くのは「管理画面を開く」の画面(Unlock.tsx)
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_PASSKEY_NAME, MAX_PASSKEYS } from '../../shared/api-types.ts'
import { ApiError } from '../../vault/api.ts'
import { localDate } from '../../vault/entry.ts'
import {
  deletePasskey,
  listPasskeys,
  PasskeyCancelledError,
  PasskeyExistsError,
  passkeySupport,
  type PasskeyItem,
  PasskeyUnsupportedError,
  registerPasskey,
} from '../../vault/passkeys.ts'
import { ErrorText, Field, nextPaint, StatusText } from '../common.tsx'
import { AlertIcon } from '../icons.tsx'
import { useFocusRequest, useSectionAction, type SectionProps } from './action.ts'

const DEVICE_LEFT =
  'パスキーは端末(iPhone なら「パスワード」App、Chrome なら Google パスワード マネージャーなど)に残っています。端末の側でも「AccountManager」のパスキーを消してください'

/** 改行などの制御文字(名前に入れさせない) */
// oxlint-disable-next-line no-control-regex -- 制御文字そのものを探すための式
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u

/** 登録する名前を確かめる。だめなら画面に出す文を返す */
function nameProblem(name: string): string | null {
  if (!name) return '名前を入れてください(例「iPhone」「会社のパソコン」)'
  if ([...name].length > MAX_PASSKEY_NAME)
    return `名前は ${MAX_PASSKEY_NAME} 文字までにしてください`
  if (CONTROL_CHARS.test(name)) return '名前に改行などの見えない文字は使えません'
  return null
}

export function Passkeys(props: Pick<SectionProps, 'vault' | 'onLock'>) {
  const { vault } = props
  const [list, setList] = useState<PasskeyItem[] | null>(null)
  const [support, setSupport] = useState<'yes' | 'no' | 'unknown' | null>(null)
  const [name, setName] = useState('')
  const [current, setCurrent] = useState('')
  const [deviceLeft, setDeviceLeft] = useState(false)
  const { busy, message, problem, run, reject, fail } = useSectionAction(props.onLock)

  // 「消す」を押すとボタンが消えるので、結果へフォーカスを移す(discussion33 の 1 と同じ)
  const resultRef = useRef<HTMLDivElement>(null)
  const [focusTo, focusSeq, askFocus] = useFocusRequest<'result'>()
  useEffect(() => {
    if (focusTo === 'result') resultRef.current?.focus()
  }, [focusTo, focusSeq])

  // 開いたとき(と、金庫が開き直されたとき)に、使えるかと登録の一覧を読む
  useEffect(() => {
    let alive = true
    void passkeySupport().then((s) => alive && setSupport(s))
    listPasskeys(vault)
      .then((l) => alive && setList(l))
      .catch((e: unknown) => alive && reject(fail(e)))
    return () => {
      alive = false
    }
  }, [vault, fail, reject])

  const add = (e: FormEvent) => {
    e.preventDefault()
    setDeviceLeft(false)
    const trimmed = name.trim()
    const invalid =
      nameProblem(trimmed) ??
      (!current ? '今のマスターパスワードを入れてください' : null) ??
      (!list ? '一覧を読み込んでから、もう一度行ってください' : null)
    if (invalid || !list) return reject(invalid)
    void run(
      async () => {
        await nextPaint()
        await registerPasskey(
          vault,
          current,
          trimmed,
          list.map((p) => p.id),
        )
        setCurrent('')
        setName('')
        setList(await listPasskeys(vault))
        return `「${trimmed}」を登録しました`
      },
      (err) => {
        if (err instanceof PasskeyCancelledError) return 'パスキーを作るのをやめました'
        if (err instanceof PasskeyExistsError) {
          return 'この端末(パスキーの置き場所)には、もう登録してあります'
        }
        if (err instanceof PasskeyUnsupportedError) {
          setDeviceLeft(err.created)
          return 'この端末・ブラウザでは、パスキーで開く機能(PRF)が使えません'
        }
        if (err instanceof ApiError && err.code === 'limit_reached') {
          return `パスキーは ${MAX_PASSKEYS} つまでです。使わないものを消してください`
        }
        return undefined
      },
    )
  }

  const remove = (p: PasskeyItem) => {
    setDeviceLeft(false)
    void run(async () => {
      await deletePasskey(vault, p.id)
      setList(await listPasskeys(vault))
      setDeviceLeft(true)
      askFocus('result')
      return `「${p.name ?? '名前を読めないパスキー'}」の登録を消しました`
    })
  }

  const full = list !== null && list.length >= MAX_PASSKEYS
  return (
    <section className="settings-section" aria-labelledby="set-passkeys">
      <h3 id="set-passkeys">指紋・顔で開く(パスキー)</h3>
      <p className="section-lead">
        マスターパスワードの代わりに、Face ID・指紋・Windows Hello
        などで管理画面を開けるようにします。マスターパスワードと復旧キーは、今までどおり使えます。忘れないように、2
        週間に 1 回はマスターパスワードで開くよう求めます。
      </p>
      {support === 'no' && (
        <p className="notice notice-warn">
          <AlertIcon />
          <span>この端末・ブラウザでは使えない見込みです</span>
        </p>
      )}
      {list === null ? (
        !problem && <p className="section-lead">読み込んでいます…</p>
      ) : list.length === 0 ? (
        <p className="section-lead">まだ登録していません</p>
      ) : (
        <ul className="passkey-list" aria-label="登録したパスキー">
          {list.map((p) => (
            <li key={p.id}>
              <span className="passkey-name">{p.name ?? '(名前を読めませんでした)'}</span>
              <span className="passkey-date">
                登録した日{' '}
                <span className="num">{localDate(new Date(p.createdAt).toISOString())}</span>
              </span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                disabled={busy}
                onClick={() => remove(p)}
                aria-label={`「${p.name ?? '名前を読めないパスキー'}」の登録を消す`}
              >
                消す
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <form className="form" onSubmit={add}>
          <Field
            label="名前(どの端末のパスキーか)"
            value={name}
            onChange={setName}
            type="text"
            hint="例「iPhone」「会社のパソコン」"
            disabled={busy}
          />
          <Field
            label="今のマスターパスワード"
            value={current}
            onChange={setCurrent}
            disabled={busy}
          />
          <div className="actions">
            <button type="submit" className="btn" disabled={busy || support === 'no'}>
              {busy ? '登録しています…' : '登録する'}
            </button>
          </div>
        </form>
      )}
      {full && (
        <p className="section-lead">
          {MAX_PASSKEYS} つ登録しています。足すには、どれかを消してください
        </p>
      )}
      <div className="section-result focus-target" ref={resultRef} tabIndex={-1}>
        <StatusText>{message}</StatusText>
        <ErrorText>{problem}</ErrorText>
        {deviceLeft && (
          <p className="notice notice-warn">
            <AlertIcon />
            <span>{DEVICE_LEFT}</span>
          </p>
        )}
      </div>
    </section>
  )
}
