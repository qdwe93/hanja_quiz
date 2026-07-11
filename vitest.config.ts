import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// vinext·Cloudflare 플러그인이 있는 vite.config.ts 대신
// 이 파일이 컴포넌트 테스트 전용 구성으로 사용됩니다.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.vitest.ts"],
  },
});
