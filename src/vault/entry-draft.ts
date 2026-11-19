// 新規登録・編集の入力欄の値と、その確かめ(画面から分けてテストしやすくする)
import {
  normalizeTags,
  safeUrl,
  TWO_FACTOR_METHODS,
  validAmount,
  validDate,
  type Currency,
  type Cycle,
  type Entry,
  type TwoFactorMethod,
} from './entry.ts'

export type Draft = Omit<Entry, 'createdAt' | 'updatedAt'>

/** 入力欄の値(すべて文字列で持ち、送るときに Draft にする) */
export interface FormValues {
  serviceName: string
  url: string
  accountName: string
  email: string
  displayName: string
  summary: string
  password: string
  hasBilling: boolean
  amount: string
  currency: Currency
  cycle: Cycle
  nextRenewal: string
  twoFactorKnown: boolean
  twoFactorEnabled: boolean
  methods: TwoFactorMethod[]
  backupCodes: string
  tags: string
  memo: string
}

export function toValues(e?: Entry): FormValues {
  return {
    serviceName: e?.serviceName ?? '',
    url: e?.url ?? '',
    accountName: e?.accountName ?? '',
    email: e?.email ?? '',
    displayName: e?.displayName ?? '',
    summary: e?.summary ?? '',
    password: e?.password ?? '',
    hasBilling: !!e?.billing,
    amount: e?.billing ? String(e.billing.amount) : '',
    currency: e?.billing?.currency ?? 'JPY',
    cycle: e?.billing?.cycle ?? 'monthly',
    nextRenewal: e?.billing?.nextRenewal ?? '',
    twoFactorKnown: !!e?.twoFactor,
    twoFactorEnabled: e?.twoFactor?.enabled ?? false,
    methods: e?.twoFactor?.methods ?? [],
    backupCodes: e?.backupCodes ?? '',
    tags: e?.tags.join('、') ?? '',
    memo: e?.memo ?? '',
  }
}

/** 入力を確かめて Draft にする。だめなら理由の文 */
export function toDraft(v: FormValues): Draft | string {
  const serviceName = v.serviceName.trim()
  if (!serviceName) return 'サービス名を入れてください'
  const url = v.url.trim()
  if (url && !safeUrl(url)) return 'URL は http:// か https:// で始まるものにしてください'
  const draft: Draft = {
    schema: 1,
    serviceName,
    tags: normalizeTags(v.tags.split(/[,、,]/)),
  }
  const text = {
    url,
    accountName: v.accountName,
    email: v.email,
    displayName: v.displayName,
    summary: v.summary,
    memo: v.memo,
  } as const
  for (const [k, value] of Object.entries(text) as Array<[keyof typeof text, string]>) {
    const t = value.trim()
    if (t) draft[k] = k === 'memo' || k === 'summary' ? value.replace(/\s+$/, '') : t
  }
  // パスワードとバックアップコードは、前後の空白も中身として残す
  if (v.password) draft.password = v.password
  if (v.backupCodes.trim()) draft.backupCodes = v.backupCodes
  if (v.hasBilling) {
    const amount = Number(v.amount.replace(/[,,\s]/g, ''))
    if (v.amount.trim() === '' || !validAmount(amount, v.currency)) {
      return v.currency === 'JPY'
        ? '金額は 0 以上の整数(円)で入れてください'
        : '金額は 0 以上、小数 2 桁まで(ドル)で入れてください'
    }
    draft.billing = { amount, currency: v.currency, cycle: v.cycle }
    if (v.nextRenewal) {
      if (!validDate(v.nextRenewal)) return '次の更新日の形が違います'
      draft.billing.nextRenewal = v.nextRenewal
    }
  }
  if (v.twoFactorKnown) {
    draft.twoFactor = {
      enabled: v.twoFactorEnabled,
      methods: v.twoFactorEnabled ? TWO_FACTOR_METHODS.filter((m) => v.methods.includes(m)) : [],
    }
  }
  return draft
}
