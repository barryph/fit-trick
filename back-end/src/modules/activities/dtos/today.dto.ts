import { IsString, Matches } from 'class-validator';

/**
 * The client's own calendar date, as `YYYY-MM-DD`.
 *
 * Required (never optional) on every endpoint whose response depends on
 * "today". Today is a property of the *user*, not of the server: the device is
 * the only party that knows the user's UTC offset, and it may be on the other
 * side of a day boundary from the API host and the database. Deriving today
 * from the server clock (or from the database session's timezone) silently
 * answers yesterday's or tomorrow's question for most of the planet, so a
 * missing value is rejected instead of guessed.
 */
export default class TodayQueryDTO {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'today must be in YYYY-MM-DD format',
  })
  today: string;
}
