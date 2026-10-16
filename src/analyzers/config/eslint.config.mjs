// Project-independent ESLint flat config used against the scanned worktree.
export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      complexity: ["warn", 10],
      "max-depth": ["warn", 3],
      "max-lines-per-function": ["warn", 50],
      "max-lines": ["warn", 500],
    },
  },
];
