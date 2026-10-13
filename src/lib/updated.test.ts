import { describe, expect, it } from 'vitest';
import { updated } from './updated';

describe('the build\'s "updated" stamp', () => {
  it('gives the day in words and as an ISO date', () => {
    expect(updated(new Date('2026-10-13T06:12:00Z'))).toEqual({ text: 'Updated 13 October 2026', iso: '2026-10-13' });
  });

  it('uses the UK date, so a late-evening build in summer time is already the next day', () => {
    expect(updated(new Date('2026-10-13T23:30:00Z'))).toEqual({ text: 'Updated 14 October 2026', iso: '2026-10-14' });
    expect(updated(new Date('2026-12-31T23:30:00Z')).iso).toBe('2026-12-31');
  });
});
