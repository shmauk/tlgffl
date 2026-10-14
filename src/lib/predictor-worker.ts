// The predictor's clinch search, off the main thread: close to the end of the
// regular season the exact search can take seconds (ADR 0005, #34).
import { clinchMarks, type SeedingInput } from './seeding';

self.onmessage = (e: MessageEvent<{ id: number; input: SeedingInput }>) => {
  self.postMessage({ id: e.data.id, marks: clinchMarks(e.data.input) });
};
