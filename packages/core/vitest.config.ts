import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/__tests__/**',
        'src/index.ts',
        'src/**/types.ts',
        'src/**/*-types.ts',
        'src/**/index.ts',
        'dist/**',
        '**/*.d.ts',
        'vitest.config.ts',
        // M3+ feature directories excluded from coverage thresholds
        'src/agents/**',
        'src/skills/**',
        'src/mcp/**',
        'src/media/**',
        'src/voice/**',
        'src/providers/adapters/**',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
