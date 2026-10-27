import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  clean: true,
  noExternal: ['@acenote/contracts'],
  external: ['@nestjs/common', '@nestjs/core', '@nestjs/platform-express'],
});
