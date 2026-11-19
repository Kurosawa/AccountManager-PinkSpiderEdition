// 応答に付ける守りのヘッダー(Dev Spec 9.1)。
// API の応答にはここで付ける。画面のファイルには public/_headers で同じものを付ける
// (中身が同じであることを headers.test.ts で確かめる)
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  // 'wasm-unsafe-eval' は Argon2id の WebAssembly のため
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
].join('; ')

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

/** API の応答に、守りのヘッダーと Cache-Control: no-store を付ける */
export function withSecurityHeaders(response: Response): Response {
  const res = new Response(response.body, response)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
