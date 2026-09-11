import { types } from 'pg';
import {
  DATE_OID,
  parseDateColumn,
  registerDateTypeParser,
} from './date-parsers';

describe('Postgres DATE type parsing', () => {
  it('targets the `date` OID', () => {
    // 1082 is Postgres' `date` type. Registering the parser against the wrong
    // OID would silently leave the driver's local-midnight conversion in place.
    expect(DATE_OID).toBe(1082);
  });

  it('returns a calendar date unchanged, with no timezone attached', () => {
    // The driver default turns '2026-03-02' into a JS Date at local midnight of
    // the server process, which `toISOString()` then renders as 2026-03-01 for
    // every positive UTC offset. Passing the string through removes that step.
    expect(parseDateColumn('2026-03-02')).toBe('2026-03-02');
    expect(parseDateColumn('1999-12-31')).toBe('1999-12-31');
  });

  it('is what the pg driver uses for DATE columns once registered', () => {
    registerDateTypeParser();

    expect(types.getTypeParser(DATE_OID)).toBe(parseDateColumn);
    // The value that reaches any query's rows is the calendar date itself, so
    // no downstream `toISOString()` can shift it across a day boundary.
    const parsed = types.getTypeParser(DATE_OID)('2026-03-02') as string;
    expect(parsed).toBe('2026-03-02');
    expect(typeof parsed).toBe('string');
  });
});
