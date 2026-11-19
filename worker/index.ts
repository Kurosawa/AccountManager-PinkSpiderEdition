// Worker の入口。/api/* だけがここに届く(wrangler.jsonc の run_worker_first)。
// それ以外は dist/ の静的なファイルで、ヘッダーは public/_headers で付ける。
// どの応答にも守りのヘッダーを付け、思わぬ例外でも中身を出さない
import { error, handleApi, type Deps } from './api.ts'
import type { AppEnv } from './env.ts'
import { withSecurityHeaders } from './headers.ts'

export async function handle(request: Request, env: AppEnv, deps?: Deps): Promise<Response> {
  try {
    return withSecurityHeaders(await handleApi(request, env, deps))
  } catch (e) {
    console.error('unhandled error', describeError(request, e))
    return withSecurityHeaders(error(500, 'internal_error'))
  }
}

/**
 * ログに出す、思わぬ例外の説明。要求の本文・ヘッダー・例外の中身の値は出さず、原因の種類だけにする。
 * D1 のエラー(D1_ERROR: UNIQUE constraint failed: users.id など)は、表と列の名前だけなので、文言も出す
 */
export function describeError(request: Request, e: unknown) {
  const { pathname } = new URL(request.url)
  const name = e instanceof Error ? e.name : typeof e
  const message = e instanceof Error ? e.message : ''
  return {
    route: `${request.method} ${pathname.startsWith('/api/') ? pathname : '(other)'}`,
    name,
    ...(message.startsWith('D1_') ? { d1: message.slice(0, 200) } : {}),
  }
}

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<AppEnv>
