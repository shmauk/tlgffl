// @ts-check
import { defineConfig } from 'astro/config';

// Fully static (ADR 0002): every page is pre-rendered from build/league.sqlite.
export default defineConfig({
  trailingSlash: 'always',
});
