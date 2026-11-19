// 新規登録・編集(PRD 4 章・5 章)。強いパスワードを作る機能を含む(Dev Spec 9.4)
import { useId, useState, type FormEvent, type ReactNode } from 'react'

export type { Draft } from '../vault/entry-draft.ts'
import { toDraft, toValues, type Draft, type FormValues } from '../vault/entry-draft.ts'
import {
  CURRENCIES,
  CURRENCY_LABEL,
  CYCLE_LABEL,
  CYCLES,
  TWO_FACTOR_LABEL,
  TWO_FACTOR_METHODS,
  type Entry,
} from '../vault/entry.ts'
import {
  CHAR_SETS,
  DEFAULT_GENERATOR,
  generatePassword,
  MAX_LENGTH,
  MIN_LENGTH,
  type CharSet,
} from '../vault/password-generator.ts'
import { ErrorText } from './common.tsx'

function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'email' | 'url' | 'date' | 'password'
  multiline?: boolean
  required?: boolean
  hint?: ReactNode
  inputMode?: 'decimal'
}) {
  const id = useId()
  const hintId = useId()
  const common = {
    id,
    value: props.value,
    autoComplete: 'off',
    spellCheck: false,
    'aria-describedby': props.hint ? hintId : undefined,
  }
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
        {props.required && '(必須)'}
      </label>
      {props.multiline ? (
        <textarea
          {...common}
          className="textarea"
          rows={4}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          {...common}
          className="input"
          type={props.type ?? 'text'}
          inputMode={props.inputMode}
          required={props.required}
          autoCapitalize="off"
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.hint && (
        <p className="field-hint" id={hintId}>
          {props.hint}
        </p>
      )}
    </div>
  )
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  )
}

function Radios<T extends string>(props: {
  legend: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (v: T) => void
}) {
  const name = useId()
  return (
    <fieldset className="field">
      <legend className="field-label">{props.legend}</legend>
      <div>
        {props.options.map((o) => (
          <label key={o} className="radio">
            <input
              type="radio"
              name={name}
              checked={props.value === o}
              onChange={() => props.onChange(o)}
            />
            {props.labels[o]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const SET_LABEL: Record<CharSet, string> = {
  upper: '英大文字',
  lower: '英小文字',
  digits: '数字',
  symbols: '記号',
}

function Generator(props: { onUse: (password: string) => void }) {
  const [length, setLength] = useState(String(DEFAULT_GENERATOR.length))
  const [sets, setSets] = useState(DEFAULT_GENERATOR.sets)
  const [problem, setProblem] = useState<string | null>(null)
  const lengthId = useId()
  const make = () => {
    const n = Number(length)
    if (!Number.isInteger(n) || n < MIN_LENGTH || n > MAX_LENGTH) {
      return setProblem(`長さは ${MIN_LENGTH}〜${MAX_LENGTH} にしてください`)
    }
    if (!Object.values(sets).some(Boolean)) return setProblem('文字の種類を 1 つ以上選んでください')
    setProblem(null)
    props.onUse(generatePassword({ length: n, sets }))
  }
  return (
    <fieldset className="form-group">
      <legend>強いパスワードを作る</legend>
      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor={lengthId}>
            長さ({MIN_LENGTH}〜{MAX_LENGTH})
          </label>
          <input
            id={lengthId}
            className="input num"
            type="number"
            min={MIN_LENGTH}
            max={MAX_LENGTH}
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </div>
      </div>
      <div>
        {(Object.keys(CHAR_SETS) as CharSet[]).map((k) => (
          <Check
            key={k}
            label={SET_LABEL[k]}
            checked={sets[k]}
            onChange={(v) => setSets({ ...sets, [k]: v })}
          />
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={make}>
          作って入れる
        </button>
      </div>
      <ErrorText>{problem}</ErrorText>
    </fieldset>
  )
}

export function EntryForm(props: {
  initial?: Entry
  busy: boolean
  problem: ReactNode
  onSubmit: (draft: Draft) => void
  onCancel: () => void
}) {
  const [v, setV] = useState<FormValues>(() => toValues(props.initial))
  const [showPassword, setShowPassword] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const set =
    <K extends keyof FormValues>(key: K) =>
    (value: FormValues[K]) =>
      setV((prev) => ({ ...prev, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const draft = toDraft(v)
    if (typeof draft === 'string') return setInvalid(draft)
    setInvalid(null)
    props.onSubmit(draft)
  }

  return (
    <section className="stack">
      <header className="detail-head">
        <h2>{props.initial ? `${props.initial.serviceName}を編集` : '新しく登録'}</h2>
      </header>
      <form className="form" onSubmit={submit} noValidate>
        <TextField
          label="サービス名"
          value={v.serviceName}
          onChange={set('serviceName')}
          required
        />
        <TextField label="URL" value={v.url} onChange={set('url')} type="url" />
        <div className="form-row">
          <TextField label="アカウント名" value={v.accountName} onChange={set('accountName')} />
          <TextField
            label="登録したメールアドレス"
            value={v.email}
            onChange={set('email')}
            type="email"
          />
        </div>
        <div className="form-row">
          <TextField label="表示名" value={v.displayName} onChange={set('displayName')} />
          <TextField label="概要" value={v.summary} onChange={set('summary')} />
        </div>
        <TextField
          label="パスワード"
          value={v.password}
          onChange={set('password')}
          type={showPassword ? 'text' : 'password'}
        />
        <div>
          <Check label="パスワードを見せる" checked={showPassword} onChange={setShowPassword} />
        </div>
        <Generator
          onUse={(p) => {
            set('password')(p)
            setShowPassword(true)
          }}
        />
        <fieldset className="form-group">
          <legend>課金</legend>
          <div>
            <Check label="課金あり" checked={v.hasBilling} onChange={set('hasBilling')} />
          </div>
          {v.hasBilling && (
            <>
              <div className="form-row">
                <TextField
                  label="金額"
                  value={v.amount}
                  onChange={set('amount')}
                  inputMode="decimal"
                />
                <TextField
                  label="次の更新日"
                  value={v.nextRenewal}
                  onChange={set('nextRenewal')}
                  type="date"
                />
              </div>
              <Radios
                legend="通貨"
                options={CURRENCIES}
                labels={CURRENCY_LABEL}
                value={v.currency}
                onChange={set('currency')}
              />
              <Radios
                legend="周期"
                options={CYCLES}
                labels={CYCLE_LABEL}
                value={v.cycle}
                onChange={set('cycle')}
              />
            </>
          )}
        </fieldset>
        <fieldset className="form-group">
          <legend>二段階認証</legend>
          <div>
            <Check label="記録する" checked={v.twoFactorKnown} onChange={set('twoFactorKnown')} />
          </div>
          {v.twoFactorKnown && (
            <>
              <div>
                <Check
                  label="あり"
                  checked={v.twoFactorEnabled}
                  onChange={set('twoFactorEnabled')}
                />
              </div>
              {v.twoFactorEnabled && (
                <div>
                  {TWO_FACTOR_METHODS.map((m) => (
                    <Check
                      key={m}
                      label={TWO_FACTOR_LABEL[m]}
                      checked={v.methods.includes(m)}
                      onChange={(on) =>
                        set('methods')(on ? [...v.methods, m] : v.methods.filter((x) => x !== m))
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>
        <TextField
          label="バックアップコード"
          value={v.backupCodes}
          onChange={set('backupCodes')}
          multiline
        />
        <TextField
          label="タグ"
          value={v.tags}
          onChange={set('tags')}
          hint="「、」か「,」で区切る(例: 仕事、サブスク)"
        />
        <TextField label="メモ" value={v.memo} onChange={set('memo')} multiline />
        <ErrorText>{invalid}</ErrorText>
        <ErrorText>{props.problem}</ErrorText>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={props.busy}>
            {props.busy ? '保存しています…' : '保存する'}
          </button>
          <button type="button" className="btn" onClick={props.onCancel} disabled={props.busy}>
            やめる
          </button>
        </div>
      </form>
    </section>
  )
}
