import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  // maxWorkers: 1 garantiza que las suites de integración que comparten la misma
  // DB de test no conflicten entre sí por truncates concurrentes.
  // Los tests unitarios son rápidos, así que el overhead es mínimo.
  maxWorkers: 1,
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          paths: {
            '@/*': ['<rootDir>/src/*'],
          },
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
