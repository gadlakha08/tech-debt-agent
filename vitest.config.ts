import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // no tests for now; they will be reintroduced later under test/
  test: { include: ["test/**/*.test.ts"], exclude: [...configDefaults.exclude, "test/analyzers/samples/**"], passWithNoTests: true },
});
