/// <reference types="vitest/config" />
// Component tests render .astro components with Astro's container API. The
// scenario databases are built first (src/lib/scenarios.ts), so Python 3 with
// requirements.txt installed is needed.
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/lib/scenarios.ts'],
  },
});
