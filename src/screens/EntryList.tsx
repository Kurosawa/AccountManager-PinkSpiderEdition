// 一覧の面(PRD 5 章)。検索・タグでの絞り込み・課金の合計(PRD 5.1)・円にまとめた合計(discussion53)・更新日のお知らせ(discussion51)
import { useId, useMemo, useState } from 'react'
import type { Item } from '../vault/entries.ts'
import {
  allTags,
  compareEntries,
  CURRENCIES,
  CYCLE_LABEL,
  formatMoney,
  matches,
  monthlyTotals,
  shortDate,
} from '../vault/entry.ts'
import { yenTotal, type UsdJpyRate } from '../vault/settings.ts'
import {
  renewalLabel,
  renewalsToShow,
  renewalStatus,
  todayLocal,
  type RenewalStatus,
} from '../vault/renewal.ts'
import { ErrorText } from './common.tsx'
import { PlusIcon, SearchIcon } from './icons.tsx'

export function EntryList(props: {
  items: Item[]
  unreadable: number
  /** 設定で決めたドルの換算レート。無ければ円にまとめた行を出さない */
  rate?: UsdJpyRate
  selectedId: string | null
  onOpen: (item: Item) => void
  onNew: () => void
}) {
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const searchId = useId()
  const tagId = useId()

  const tags = useMemo(() => allTags(props.items.map((i) => i.entry)), [props.items])
  const shown = useMemo(
    () =>
      props.items
        .filter((i) => matches(i.entry, query, tag))
        .sort((a, b) => compareEntries(a.entry, b.entry)),
    [props.items, query, tag],
  )
  // 合計は、絞り込みに関わらず全件で出す
  const totals = useMemo(() => monthlyTotals(props.items.map((i) => i.entry)), [props.items])
  const totalParts = CURRENCIES.filter((c) => totals[c] > 0)
  const filtered = shown.length !== props.items.length
  // お知らせも、絞り込みに関わらず全件で出す。日付は描くたびに端末の今日で数える
  const today = todayLocal()
  const renewals = renewalsToShow(props.items, today)

  return (
    <>
      <div className="list-head">
        <div className="list-title">
          <h1>登録したサービス</h1>
          <span className="list-count num">
            {filtered ? `${shown.length} / ${props.items.length} 件` : `${props.items.length} 件`}
          </span>
        </div>
        <p className="total">
          <span>月あたりの課金</span>
          {totalParts.length === 0 ? (
            <strong>なし</strong>
          ) : (
            totalParts.map((c, i) => (
              <span key={c}>
                {i > 0 && '+ '}
                <strong className="num">{formatMoney(totals[c], c)}</strong>
              </span>
            ))
          )}
        </p>
        {/* ドルの課金があり、レートを決めているときだけ、円にまとめた額を足す(レートは見当なので「約」) */}
        {props.rate && totals.USD > 0 && (
          <p className="total-yen">
            円にすると 月 約{' '}
            <strong className="num">{formatMoney(yenTotal(totals, props.rate.rate), 'JPY')}</strong>
            <span className="total-rate">
              (1 ドル = <span className="num">{props.rate.rate}</span> 円。
              <span className="num">{shortDate(props.rate.decidedOn, today)}</span> に決めた)
            </span>
          </p>
        )}
        {renewals.length > 0 && (
          <Renewals renewals={renewals} today={today} onOpen={props.onOpen} />
        )}
        <div className="search">
          <label htmlFor={searchId} className="visually-hidden">
            検索
          </label>
          <SearchIcon />
          <input
            id={searchId}
            className="input input-search"
            type="search"
            placeholder="サービス名・アカウント名で探す"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="list-tools">
          {tags.length > 0 ? (
            <>
              <label htmlFor={tagId} className="visually-hidden">
                タグ
              </label>
              <select
                id={tagId}
                className="select"
                value={tag ?? ''}
                onChange={(e) => setTag(e.target.value === '' ? null : e.target.value)}
              >
                <option value="">すべてのタグ</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn-primary" onClick={props.onNew}>
            <PlusIcon />
            登録
          </button>
        </div>
        {props.unreadable > 0 && (
          <ErrorText>読めない件が {props.unreadable} 件あります(暗号を開けませんでした)</ErrorText>
        )}
      </div>
      <div className="list-body">
        {props.items.length === 0 ? (
          <div className="empty">
            <p>まだ登録がありません。</p>
            <button type="button" className="btn" onClick={props.onNew}>
              <PlusIcon />
              最初のサービスを登録する
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p>当てはまるサービスがありません。</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery('')
                setTag(null)
              }}
            >
              絞り込みを外す
            </button>
          </div>
        ) : (
          <ul>
            {shown.map((item) => {
              const e = item.entry
              const sub = e.accountName ?? e.email ?? e.displayName
              const billed = e.billing
              const due = renewalStatus(billed, today)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="entry"
                    aria-current={item.id === props.selectedId ? 'true' : undefined}
                    onClick={() => props.onOpen(item)}
                  >
                    <span className="entry-name">{e.serviceName}</span>
                    {billed && (
                      <span className="entry-amount num">
                        {formatMoney(billed.amount, billed.currency)}
                        <span className="entry-cycle"> / {CYCLE_LABEL[billed.cycle]}</span>
                      </span>
                    )}
                    {sub && <span className="entry-sub">{sub}</span>}
                    {due && <DueMark status={due} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

/** 一覧の行の印(「今日」「あと 2 日」「過ぎています」) */
function DueMark(props: { status: RenewalStatus }) {
  return (
    <span className={`entry-due ${props.status.kind === 'overdue' ? 'is-overdue' : ''}`}>
      {renewalLabel(props.status)}
    </span>
  )
}

/** 多すぎると一覧の面の上が伸びるので、先頭の 3 件だけを出す(ほかは行の印で分かる) */
const RENEWALS_SHOWN = 3

/** 一覧の上の、更新が近い・過ぎたもののお知らせ(discussion51 の 2)。閉じるボタンは持たない */
function Renewals(props: {
  renewals: { item: Item; status: RenewalStatus }[]
  today: string
  onOpen: (item: Item) => void
}) {
  const titleId = useId()
  const head = props.renewals.slice(0, RENEWALS_SHOWN)
  const rest = props.renewals.length - head.length
  return (
    <section className="renewals" aria-labelledby={titleId}>
      <h2 id={titleId} className="renewals-title">
        更新が近いもの <span className="num">{props.renewals.length} 件</span>
      </h2>
      <ul>
        {head.map(({ item, status }) => (
          <li key={item.id}>
            <button type="button" className="renewal" onClick={() => props.onOpen(item)}>
              <span className="renewal-name">{item.entry.serviceName}</span>
              <span className={`renewal-when ${status.kind === 'overdue' ? 'is-overdue' : ''}`}>
                <span className="num">{shortDate(status.date, props.today)}</span>
                {renewalLabel(status)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="renewals-more">ほか {rest} 件は、一覧の行の印で分かります</p>}
    </section>
  )
}
