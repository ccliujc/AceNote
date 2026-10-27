export default {
  provider: 'v8' as const,
  reporter: ['text', 'html'],
  include: [
    'src/main/task-repository.ts',
    'src/main/capture-service.ts',
    'src/main/parse-queue.ts',
    'src/renderer/capture-page.tsx',
    'src/renderer/task-list.tsx',
    'src/renderer/task-editor.tsx',
    'src/renderer/reparse-dialog.tsx',
  ],
  thresholds: { statements: 80, branches: 80 },
};
