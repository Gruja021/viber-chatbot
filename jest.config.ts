import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['./src/__tests__/setup.ts'],
  modulePathIgnorePatterns: ['dist'],
};

export default config;
