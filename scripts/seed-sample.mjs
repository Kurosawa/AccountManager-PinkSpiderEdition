// 手元の開発用に、見本の金庫と架空のサービスの件を作る(discussion11)。本番には使わない。
// アプリと同じ暗号の部品(src/vault・src/crypto)を Node.js で動かし、手元の開発サーバーの API に送る。
//
// 使い方:
//   1. 手元の D1 の表を空にする(npm run db:migrate:local のあと)
//      npx wrangler d1 execute account-manager-demo --local --command "DELETE FROM sessions; DELETE FROM entries; DELETE FROM users;"
//   2. 開発サーバーを動かす: npm run dev(.dev.vars の DEV_ACCESS_EMAIL が見本の利用者になる)
//   3. node scripts/seed-sample.mjs http://localhost:5173
//
// 見本の金庫のマスターパスワードは下の SAMPLE_PASSWORD。回復キーは実行のたびに作られ、最後に出力する。
// どちらも見本用で、本物のデータは入れない
import { addEntry } from '../src/vault/entries.ts'
import { commitVault, fetchMe, prepareVault } from '../src/vault/flows.ts'
import { generatePassword } from '../src/vault/password-generator.ts'

export const SAMPLE_PASSWORD = 'mihon-no-kinko-hiraku-kagi'

const base = process.argv[2]
if (!base || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error('手元の開発サーバーの URL を渡してください(例: http://localhost:5173)')
  process.exit(2)
}

// アプリは同じ origin の /api/* を呼ぶので、台本では手元のサーバーの URL を前に付ける
const realFetch = globalThis.fetch
globalThis.fetch = (path, init) => realFetch(new URL(path, base), init)

/** 架空のサービス(実在の名前は使わない) */
const SAMPLES = [
  {
    serviceName: '動画見放題サービス',
    url: 'https://video.example.com/login',
    accountName: 'family-01',
    email: 'sample@example.com',
    summary: '家族で映画とドラマを見る',
    billing: { amount: 1490, currency: 'JPY', cycle: 'monthly', nextRenewal: '2026-12-01' },
    twoFactor: { enabled: true, methods: ['app'] },
    tags: ['サブスク', '家族'],
  },
  {
    serviceName: '音楽ストリーミング',
    url: 'https://music.example.com/',
    accountName: 'sample.listener',
    billing: { amount: 980, currency: 'JPY', cycle: 'monthly', nextRenewal: '2026-11-25' },
    twoFactor: { enabled: false, methods: [] },
    tags: ['サブスク'],
  },
  {
    serviceName: 'クラウドストレージ',
    url: 'https://storage.example.com/signin',
    email: 'sample@example.com',
    summary: '写真と書類のバックアップ',
    billing: { amount: 13000, currency: 'JPY', cycle: 'yearly', nextRenewal: '2027-04-10' },
    twoFactor: { enabled: true, methods: ['securityKey', 'app'] },
    backupCodes: '1111-2222\n3333-4444\n5555-6666',
    tags: ['サブスク', '仕事'],
  },
  {
    serviceName: 'デザインツール',
    url: 'https://design.example.com/',
    accountName: 'sample-designer',
    billing: { amount: 20, currency: 'USD', cycle: 'monthly', nextRenewal: '2026-12-03' },
    twoFactor: { enabled: true, methods: ['app'] },
    tags: ['仕事', 'サブスク'],
  },
  {
    serviceName: 'コード置き場',
    url: 'https://code.example.com/login',
    accountName: 'sample-dev',
    email: 'dev@example.com',
    billing: { amount: 48, currency: 'USD', cycle: 'yearly', nextRenewal: '2027-02-14' },
    twoFactor: { enabled: true, methods: ['securityKey'] },
    backupCodes: 'abcd-efgh-ijkl\nmnop-qrst-uvwx',
    tags: ['仕事'],
  },
  {
    serviceName: 'ネット銀行',
    url: 'https://bank.example.com/',
    accountName: '1234567',
    displayName: 'みほん たろう',
    summary: '生活費の口座',
    twoFactor: { enabled: true, methods: ['sms', 'app'] },
    tags: ['お金'],
    memo: '支店番号 001。暗証番号はここに書かない',
  },
  {
    serviceName: 'ネット通販の会員',
    url: 'https://shop.example.com/',
    email: 'sample@example.com',
    billing: { amount: 5900, currency: 'JPY', cycle: 'yearly', nextRenewal: '2027-06-30' },
    twoFactor: { enabled: false, methods: [] },
    tags: ['買い物', 'サブスク'],
  },
  {
    serviceName: '写真編集アプリ',
    url: 'https://photo.example.com/',
    email: 'sample@example.com',
    billing: { amount: 4800, currency: 'JPY', cycle: 'once' },
    tags: ['買い物'],
  },
  {
    serviceName: '電子書籍ストア',
    url: 'https://books.example.com/',
    email: 'sample@example.com',
    tags: ['買い物'],
  },
  {
    serviceName: 'オンライン英会話',
    url: 'https://english.example.com/',
    accountName: 'sample-learner',
    billing: { amount: 6480, currency: 'JPY', cycle: 'monthly', nextRenewal: '2026-12-15' },
    twoFactor: { enabled: false, methods: [] },
    tags: ['学び', 'サブスク'],
    memo: '月 8 回のプラン。\n先生のお気に入り: 3 人',
  },
  {
    serviceName: '地域の図書館の予約',
    url: 'https://library.example.com/account/reservations/history?from=2020-01-01&to=2026-12-31&sort=returned_at_desc',
    accountName: '0001234567',
    tags: ['学び'],
    memo: '利用者カードの番号がアカウント名。予約の受け取りは駅前の分館がいちばん近いので、窓口の受け取り場所を毎回そちらに変えること(既定は本館になっている)',
  },
  {
    serviceName: 'フリマアプリ',
    url: 'https://flea.example.com/',
    email: 'sample@example.com',
    displayName: 'みほん屋',
    twoFactor: { enabled: true, methods: ['email'] },
    tags: ['買い物'],
  },
]

const me = await fetchMe()
if (me.vault) {
  console.error('手元の D1 に、もう金庫があります。先に表を空にしてください(上の使い方の 1)')
  process.exit(1)
}
const prepared = await prepareVault(me.userId, SAMPLE_PASSWORD)
const vault = await commitVault(prepared)
for (const s of SAMPLES) {
  const { billing, twoFactor, ...rest } = s
  await addEntry(vault, {
    schema: 1,
    ...rest,
    password: generatePassword(),
    ...(billing ? { billing } : {}),
    ...(twoFactor ? { twoFactor } : {}),
  })
}
console.log(`見本の金庫を作り、${SAMPLES.length} 件を足しました`)
console.log(`見本用のマスターパスワード: ${SAMPLE_PASSWORD}`)
console.log(`見本用の回復キー: ${prepared.recoveryKey}`)
