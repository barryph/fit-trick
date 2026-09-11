import { BadRequestException, Type, ValidationPipe } from '@nestjs/common';
import TodayQueryDTO from './today.dto';
import MonthQueryDTO from './month.dto';

/**
 * Mirrors the global pipe configured in `configure-app.ts`, so these are the
 * same acceptance rules the running API applies.
 */
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validateQuery(metatype: Type<unknown>, value: unknown) {
  return pipe.transform(value, { type: 'query', metatype });
}

describe('today query parameter', () => {
  it('accepts the client local date', async () => {
    await expect(
      validateQuery(TodayQueryDTO, { today: '2026-03-02' }),
    ).resolves.toEqual({ today: '2026-03-02' });
  });

  it('rejects a missing today instead of falling back to a server date', async () => {
    // There is no server-side substitute for the user's calendar date, so an
    // absent value is a client bug and must surface as 400 rather than as
    // yesterday's or tomorrow's schedule.
    await expect(validateQuery(TodayQueryDTO, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a non-calendar today', async () => {
    const invalid = [
      '',
      'today',
      '2026-3-2',
      '2026-03-02T00:00:00Z',
      '03/02/2026',
      '2026-03-02 ',
      // A full instant would drag a timezone (and a time) into a calendar date.
      '2026-03-02T23:00:00.000Z',
    ];

    for (const today of invalid) {
      await expect(
        validateQuery(TodayQueryDTO, { today }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('month query parameter', () => {
  it('accepts a calendar month', async () => {
    await expect(
      validateQuery(MonthQueryDTO, { month: '2026-03' }),
    ).resolves.toEqual({ month: '2026-03' });
  });

  it('rejects a missing or malformed month', async () => {
    for (const month of [undefined, '', '2026', '2026-3', 'March 2026']) {
      await expect(
        validateQuery(MonthQueryDTO, { month }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
