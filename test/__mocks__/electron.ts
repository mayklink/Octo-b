// Mock electron module for Node.js test environment
// Only the `app` export is needed by database.ts (for getPath)
export const app = {
  getPath: (name: string): string => {
    if (name === 'home') return '/tmp/octob-test-mock-home'
    return `/tmp/octob-test-mock-${name}`
  }
}
