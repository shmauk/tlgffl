import { describe, expect, it } from 'vitest';
import { throughWeek, updatedOn } from './updated';

describe('the build\'s "updated" stamp', () => {
  it('gives the build date in words and as an ISO date', () => {
    expect(updatedOn('2026-10-13')).toEqual({ text: 'Updated 13 October 2026', iso: '2026-10-13' });
    expect(updatedOn('2027-01-02')).toEqual({ text: 'Updated 2 January 2027', iso: '2027-01-02' });
  });

  it('on a current-season view, says how far the season has got', () => {
    expect(throughWeek('2026-10-13', 4)).toBe('Updated 13 October 2026, through week 4');
    expect(throughWeek('2026-09-09', null)).toBe('Updated 9 September 2026, week 1 not yet final');
  });
});
