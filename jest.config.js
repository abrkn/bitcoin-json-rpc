export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    // Rewrite ./foo/bar.js to ./foo/bar
    '^(\\..+)\\.js': '$1',
  },
};
