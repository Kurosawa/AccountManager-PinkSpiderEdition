// マスターパスワードの基準(Dev Spec 9.5)。12 文字以上で、よく使われるパスワードの一覧に入っていないこと。
// 文字の種類の決まりは設けない

export const MIN_MASTER_PASSWORD_LENGTH = 12

/** 一覧のファイル(1 行 1 件、# で始まる行は説明)を、小文字にそろえた集まりにする */
export function parseCommonPasswords(text: string): Set<string> {
  const set = new Set<string>()
  for (const line of text.split('\n')) {
    const p = line.trim()
    if (p && !p.startsWith('#')) set.add(p.toLowerCase())
  }
  return set
}

let loading: Promise<ReadonlySet<string>> | null = null

/**
 * よく使われるパスワードの一覧(common-passwords.txt。出どころはファイルの先頭)を読み込む。
 * 金庫を作る画面と回復の画面でだけ使うので、そのときに別のファイルとして読み込む(discussion08)
 */
export function loadCommonPasswords(): Promise<ReadonlySet<string>> {
  loading ??= import('./common-passwords.txt?raw').then((m) => parseCommonPasswords(m.default))
  return loading
}

/** 文字数(絵文字などを 1 文字と数える) */
export function passwordLength(password: string): number {
  return [...password.normalize('NFC')].length
}

/** 基準に合わなければ、理由を返す。合えば null */
export function checkMasterPassword(password: string, common: ReadonlySet<string>): string | null {
  if (passwordLength(password) < MIN_MASTER_PASSWORD_LENGTH) {
    return `${MIN_MASTER_PASSWORD_LENGTH} 文字以上にしてください`
  }
  if (common.has(password.normalize('NFC').toLowerCase())) {
    return 'よく使われているパスワードです。ほかのものにしてください'
  }
  return null
}
