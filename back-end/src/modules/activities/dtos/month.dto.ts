import { IsString, Matches } from 'class-validator';

/**
 * A calendar month as `YYYY-MM`, sent by the client from its own local date.
 *
 * Validated rather than accepted as a free string: the value is compared with
 * `to_char(date, 'YYYY-MM')`, so a malformed or missing month would silently
 * match nothing and look like "no completions" instead of a client bug.
 */
export default class MonthQueryDTO {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month: string;
}
