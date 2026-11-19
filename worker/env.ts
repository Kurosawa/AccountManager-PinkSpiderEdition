// Worker が受け取る値。DB は wrangler.jsonc、ほかは Secret(本番)か .dev.vars(手元)で渡す(Dev Spec 4.1)
export interface AppEnv extends Env {
  /** Zero Trust のチームのホスト名(Secret。URL ではなくホストだけ) */
  ACCESS_TEAM_DOMAIN?: string
  /** Access のアプリの AUD(Secret) */
  ACCESS_AUD?: string
  /** メールアドレスから利用者の ID を作る鍵(Secret。失うと誰のデータか分からなくなる) */
  USER_ID_PEPPER?: string
  /** 合言葉を HMAC する鍵(Secret) */
  AUTH_PEPPER?: string
  /** 手元だけ 'development'(.dev.vars)。wrangler.jsonc には書かない */
  ENVIRONMENT?: string
  /** 手元の開発で利用者として扱うメールアドレス(.dev.vars) */
  DEV_ACCESS_EMAIL?: string
}
