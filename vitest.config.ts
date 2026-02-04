import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        testTimeout: 120000, // 2 minutes for server tests
        hookTimeout: 60000,
        teardownTimeout: 10000,
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
        // Run chain tests sequentially to avoid port conflicts
        // Using threads instead of forks to avoid Node v24 tinypool issues
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: true,
            },
        },
    },
});
