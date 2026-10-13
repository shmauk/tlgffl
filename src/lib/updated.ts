// The build's "updated <date>" stamp (#26), shown in every page's footer. The
// date is the UK day the site was built: the scheduled refresh rebuilds it
// each run, so the stamp tells a reader how fresh the data is.
const UK = 'Europe/London';

export function updated(at: Date): { text: string; iso: string } {
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: UK, ...opts }).format(at);
  const iso = `${part({ year: 'numeric' })}-${part({ month: '2-digit' })}-${part({ day: '2-digit' })}`;
  return { text: `Updated ${part({ day: 'numeric', month: 'long', year: 'numeric' })}`, iso };
}

/** When this build ran. */
export const BUILT_AT = new Date();
