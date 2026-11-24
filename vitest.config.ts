import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/server/src/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // 서버 통합 테스트는 각각 독립 서버를 띄우므로 파일 단위 병렬은 허용
  },
});
