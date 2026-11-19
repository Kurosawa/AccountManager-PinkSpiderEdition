// 詳細の面(PRD 5 章)。秘密の項目は初めは伏せ、押したときだけ見せる(PRD 3.4)。コピーは 30 秒で消す(Dev Spec 9.3)。
// コピーした欄は、ボタンが「コピーしました」に変わり、欄の下の線が 30 秒かけて減る(.impeccable/surfaces の取り決めの署名の動き)
import { useEffect, useState, type ReactNode } from 'react'
import { CLEAR_AFTER_MS, copySecret } from '../vault/clipboard.ts'
import type { Item } from '../vault/entries.ts'
import { CYCLE_LABEL, formatMoney, localDate, safeUrl, TWO_FACTOR_LABEL } from '../vault/entry.ts'
import { advanceRenewal, renewalLabel, renewalStatus, todayLocal } from '../vault/renewal.ts'
import { ErrorText } from './common.tsx'
import { CheckIcon, CopyIcon, ExternalIcon, EyeIcon, EyeOffIcon } from './icons.tsx'

type Copied = { field: string; at: number } | null

function Row(props: { label: string; children: ReactNode; tools?: ReactNode; meter?: number }) {
  return (
    <div className="sheet-row">
      <dt className="sheet-label">{props.label}</dt>
      <dd className="sheet-value">{props.children}</dd>
      <dd className="sheet-tools">{props.tools}</dd>
      {props.meter !== undefined && (
        <>
          {/* スマホでは表の下の知らせが画面の外に出るので、行の中にも短く出す(読み上げは表の下の知らせだけ) */}
          <span className="row-note" aria-hidden="true">
            30 秒で消えます
          </span>
          <span key={props.meter} className="clear-meter" aria-hidden="true" />
        </>
      )}
    </div>
  )
}

function CopyButton(props: {
  field: string
  text: string
  label: string
  copied: Copied
  onCopied: (c: Copied, message: string | null) => void
}) {
  const done = props.copied?.field === props.field
  return (
    <button
      type="button"
      className={`btn btn-small ${done ? 'copied' : ''}`}
      aria-label={`${props.label}をコピー`}
      onClick={() =>
        void copySecret(props.text).then((ok) =>
          ok
            ? props.onCopied({ field: props.field, at: Date.now() }, null)
            : props.onCopied(null, 'コピーできませんでした。もう一度押してください'),
        )
      }
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? 'コピーしました' : 'コピー'}
    </button>
  )
}

function SecretTools(props: {
  shown: boolean
  onToggle: () => void
  label: string
  children: ReactNode
}) {
  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        onClick={props.onToggle}
        aria-pressed={props.shown}
        aria-label={`${props.label}を${props.shown ? '隠す' : '見せる'}`}
      >
        {props.shown ? <EyeOffIcon /> : <EyeIcon />}
        {props.shown ? '隠す' : '見せる'}
      </button>
      {props.children}
    </>
  )
}

export function EntryDetail(props: {
  item: Item
  busy: boolean
  problem: ReactNode
  onEdit: () => void
  onDelete: () => void
  /** 過ぎた更新日を、次の更新日に進めて保存する(discussion51 の 3) */
  onAdvanceRenewal: (nextRenewal: string) => void
}) {
  const e = props.item.entry
  const [copied, setCopied] = useState<Copied>(null)
  const [copyProblem, setCopyProblem] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState(false)
  const url = safeUrl(e.url)
  const today = todayLocal()
  const due = renewalStatus(e.billing, today)
  const advanced = due?.kind === 'overdue' && e.billing ? advanceRenewal(e.billing, today) : null

  // 30 秒たったら、コピーの表示を戻す(クリップボードは clipboard.ts が空にする)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), CLEAR_AFTER_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const onCopied = (c: Copied, problem: string | null) => {
    setCopied(c)
    setCopyProblem(problem)
  }
  const copy = (field: string, text: string, label: string) => (
    <CopyButton field={field} text={text} label={label} copied={copied} onCopied={onCopied} />
  )
  const meter = (field: string) => (copied?.field === field ? copied.at : undefined)
  const toggle = (field: string) => () => setShown((s) => ({ ...s, [field]: !s[field] }))

  return (
    <article className="stack">
      <header className="detail-head">
        <h2>{e.serviceName}</h2>
        <button type="button" className="btn" onClick={props.onEdit} disabled={props.busy}>
          編集する
        </button>
      </header>
      <dl className="sheet">
        {e.url && (
          <Row
            label="URL"
            tools={
              url && (
                <a className="btn btn-small" href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalIcon />
                  開く
                </a>
              )
            }
          >
            {e.url}
          </Row>
        )}
        {e.accountName && (
          <Row
            label="アカウント名"
            tools={copy('account', e.accountName, 'アカウント名')}
            meter={meter('account')}
          >
            {e.accountName}
          </Row>
        )}
        {e.email && (
          <Row
            label="登録したメールアドレス"
            tools={copy('email', e.email, 'メールアドレス')}
            meter={meter('email')}
          >
            {e.email}
          </Row>
        )}
        {e.password && (
          <Row
            label="パスワード"
            meter={meter('password')}
            tools={
              <SecretTools
                shown={!!shown['password']}
                onToggle={toggle('password')}
                label="パスワード"
              >
                {copy('password', e.password, 'パスワード')}
              </SecretTools>
            }
          >
            <span className={shown['password'] ? 'secret' : 'secret masked'}>
              {shown['password'] ? e.password : '••••••••'}
            </span>
          </Row>
        )}
        {e.displayName && <Row label="表示名">{e.displayName}</Row>}
        {e.summary && <Row label="概要">{e.summary}</Row>}
        {e.billing && (
          <Row
            label="課金"
            tools={
              advanced && (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => props.onAdvanceRenewal(advanced)}
                  disabled={props.busy}
                  aria-label={`次の更新日を ${advanced} に進める`}
                >
                  <span className="num">{advanced}</span> に進める
                </button>
              )
            }
          >
            <span className="num">{formatMoney(e.billing.amount, e.billing.currency)}</span> /{' '}
            {CYCLE_LABEL[e.billing.cycle]}
            {e.billing.nextRenewal && (
              <>
                {'　'}
                {/* 日付が途中で折り返さないよう、「次の更新日」から印までを 1 つにまとめる */}
                <span className="renewal-at">
                  次の更新日 <span className="num">{e.billing.nextRenewal}</span>
                  {due && (
                    <span className={`renewal-note ${due.kind === 'overdue' ? 'is-overdue' : ''}`}>
                      {renewalLabel(due)}
                    </span>
                  )}
                </span>
              </>
            )}
          </Row>
        )}
        {e.twoFactor && (
          <Row label="二段階認証">
            {e.twoFactor.enabled
              ? `あり${e.twoFactor.methods.length ? `(${e.twoFactor.methods.map((m) => TWO_FACTOR_LABEL[m]).join('・')})` : ''}`
              : 'なし'}
          </Row>
        )}
        {e.backupCodes && (
          <Row
            label="バックアップコード"
            meter={meter('backup')}
            tools={
              <SecretTools
                shown={!!shown['backup']}
                onToggle={toggle('backup')}
                label="バックアップコード"
              >
                {copy('backup', e.backupCodes, 'バックアップコード')}
              </SecretTools>
            }
          >
            {shown['backup'] ? (
              <Lines text={e.backupCodes} mono />
            ) : (
              <span className="secret masked">••••••••</span>
            )}
          </Row>
        )}
        {e.tags.length > 0 && (
          <Row label="タグ">
            <span className="tags">
              {e.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </span>
          </Row>
        )}
        {e.memo && (
          <Row label="メモ">
            <Lines text={e.memo} />
          </Row>
        )}
      </dl>
      {/* コピーの知らせは表の下の決まった場所に出す(表の上に差し込むと、押したボタンが下へずれるため) */}
      <p className="copy-status" role="status">
        {copied
          ? 'コピーしました。30 秒たつと、クリップボードから消えます。'
          : 'コピーしたものは、30 秒たつとクリップボードから消えます。'}
      </p>
      <ErrorText>{copyProblem}</ErrorText>
      <ErrorText>{props.problem}</ErrorText>
      {/* 登録した日・更新した日(discussion23)。暗号の中にある日時を、端末の時刻の日付で出す */}
      <EntryDates createdAt={e.createdAt} updatedAt={e.updatedAt} />
      <section className="danger-zone" aria-label="削除">
        {!confirming ? (
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirming(true)}
              disabled={props.busy}
            >
              削除する
            </button>
          </div>
        ) : (
          <>
            <p className="notice notice-error" role="alert">
              「{e.serviceName}」を削除します。元には戻せません。
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={props.onDelete}
                disabled={props.busy}
              >
                {props.busy ? '削除しています…' : '削除する'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(false)}
                disabled={props.busy}
              >
                やめる
              </button>
            </div>
          </>
        )}
      </section>
    </article>
  )
}

function EntryDates(props: { createdAt: string; updatedAt: string }) {
  const created = localDate(props.createdAt)
  const updated = localDate(props.updatedAt)
  if (!created && !updated) return null
  return (
    <p className="entry-dates">
      {created && (
        <span>
          登録した日 <span className="num">{created}</span>
        </span>
      )}
      {updated && (
        <span>
          更新した日 <span className="num">{updated}</span>
        </span>
      )}
    </p>
  )
}

/** 改行は残し、長い行は折り返す(pre は折り返さず、狭い画面ではみ出すため) */
function Lines(props: { text: string; mono?: boolean }) {
  return (
    <span className={props.mono ? 'secret' : undefined}>
      {props.text.split('\n').map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </span>
  )
}
