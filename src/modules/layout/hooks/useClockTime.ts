import { useEffect, useState } from 'react';
import { CLOCK_LOCALE } from '../../../shared/config/constants';

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour:   '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

function nowString(locale: string): string {
  return new Date().toLocaleTimeString(locale, TIME_OPTIONS);
}

/**
 * Returns the current wall-clock time as a formatted string, updated every
 * second. Defaults to the application locale defined in `config/constants`.
 */
export function useClockTime(locale = CLOCK_LOCALE): string {
  const [time, setTime] = useState(() => nowString(locale));

  useEffect(() => {
    const id = setInterval(() => setTime(nowString(locale)), 1_000);
    return () => clearInterval(id);
  }, [locale]);

  return time;
}
