import { describe, expect, it } from 'vitest';
import { updatedOn } from './updated';

describe('the build\'s "updated" stamp', () => {
  it('gives the build date in words and as an ISO date', () => {
    expect(updatedOn('2026-10-13')).toEqual({ text: 'Updated 13 October 2026', iso: '2026-10-13' });
    expect(updatedOn('2027-01-02')).toEqual({ text: 'Updated 2 January 2027', iso: '2027-01-02' });
  });
});
