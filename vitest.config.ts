import { defineConfig } from 'vitest/config'

// 単体テストは vite.config.ts を読まない(Cloudflare の開発用の仕組みを立ち上げないため)。
// 暗号の部品(src/)と Worker の処理(worker/)は、どちらも Node.js の上で確かめる。
// 画面のテスト(*.test.tsx)は、ファイルの先頭の @vitest-environment jsdom で jsdom の上で動かす
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'worker/**/*.test.ts'],
  },
})
