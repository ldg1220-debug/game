import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 아트 랩만 한 덩어리로 빌드하는 설정.
 *
 * 결과 JS·CSS를 HTML 한 장에 인라인해서 배포하려면 청크가 갈라지면 안 된다.
 * 코드 분할을 끄고 에셋을 인라인한다.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-artlab',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: 'artlab.html',
      output: { inlineDynamicImports: true, entryFileNames: 'a.js', assetFileNames: 'a[extname]' },
    },
  },
});
