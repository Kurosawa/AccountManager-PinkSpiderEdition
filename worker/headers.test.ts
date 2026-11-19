// 守りのヘッダー(Dev Spec 9.1)のテスト
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import headersFile from '../public/_headers?raw'
import { SECURITY_HEADERS } from './headers.ts'
import { caller, startDb } from './testing.ts'

let db: Awaited<ReturnType<typeof startDb>>
beforeAll(async () => {
  db = await startDb()
})
afterAll(() => db.dispose())

/** public/_headers の、あるパスの節のヘッダーを読む(`! 名前` の取り消しの行は除く) */
function headersFileSection(path: string): Record<string, string> {
  const result: Record<string, string> = {}
  let current: string | null = null
  for (const line of headersFile.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!line.startsWith(' ')) {
      current = line.trim()
      continue
    }
    if (current !== path || line.trim().startsWith('!')) continue
    const index = line.indexOf(':')
    result[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return result
}

describe('守りのヘッダー', () => {
  it('API の応答には、守りのヘッダーと Cache-Control: no-store が付く(エラーでも)', async () => {
    const call = caller(db.db)
    for (const [path, opts] of [
      ['/api/health', {}],
      ['/api/me', { noDevDefaults: true }],
    ] as const) {
      const res = await call('GET', path, undefined, opts)
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers.get(name)).toBe(value)
      }
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    }
  })

  it('画面のファイル(public/_headers)にも、同じ守りのヘッダーが付く', () => {
    expect(headersFileSection('/*')).toEqual({ ...SECURITY_HEADERS, 'Cache-Control': 'no-store' })
  })

  it('ハッシュの付いたファイルだけ、長く置いてよい', () => {
    expect(headersFileSection('/assets/*')).toEqual({
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  })

  it('CSP は外のものを読み込まない', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy'] ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).not.toMatch(/https?:|\*|'unsafe-inline'|'unsafe-eval'/)
  })
})
