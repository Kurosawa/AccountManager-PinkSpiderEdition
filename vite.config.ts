import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// cloudflare(): 開発サーバーの中で Worker(worker/index.ts)と手元の D1 を動かす。
// 設定は wrangler.jsonc から読む。--host は使わない(localhost にだけ公開する)
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    // 本番のファイルに元のソースの対応表を入れない
    sourcemap: false,
  },
})
