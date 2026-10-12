/// <reference types="vitest/config" />
// Component tests render .astro components with Astro's container API.
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
