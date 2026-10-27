import { defineConfig } from 'vitest/config';
import coverage from './test/coverage.config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage,
  },
});
