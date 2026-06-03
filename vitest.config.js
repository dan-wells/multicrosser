export default {
  test: {
    environment: 'jsdom',
    include: ['app/javascript/**/__tests__/**/*.test.js'],
    setupFiles: ['app/javascript/__tests__/setup.js'],
  },
};
