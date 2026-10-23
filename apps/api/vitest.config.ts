import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // env tests replace process.env and key tests install fake timers.
    fileParallelism: false,
    testTimeout: 20_000,
    // tsc emits tests into dist; run the TypeScript sources once.
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
