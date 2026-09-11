import * as fs from 'node:fs';
import * as path from 'node:path';
import knex from 'knex';

/**
 * Guards a silent SQL-construction failure.
 *
 * `knex.raw` scans `:name` tokens anywhere in a statement. Writing
 * `:today::date` therefore works only while the bindings object happens to have
 * no `date` key: the scanner consumes `:today`, then reads `:date` out of the
 * `::` cast and turns it into a second placeholder, producing `$1:$2` and a
 * syntax error at the database. Adding an unrelated binding is enough to break
 * a query that has worked for months.
 *
 * A plain column cast has the same hazard - `sess::jsonb` renders as `sess:?`
 * the moment a `jsonb` binding exists - so the rule is simply that raw SQL
 * never uses `::`, and writes `CAST(:name AS type)` / `CAST(column AS type)`
 * instead. Neither form can collide.
 */

const SRC_ROOT = path.join(__dirname, '..');
const DOUBLE_COLON_CAST = /\w::\w/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(fullPath);
    }
    // Specs may quote the anti-pattern while explaining it.
    if (!entry.name.endsWith('.ts') || entry.name.includes('spec.ts')) {
      return [];
    }
    return [fullPath];
  });
}

describe('SQL named bindings', () => {
  it('breaks when a binding is followed by a `::` cast', () => {
    const renderer = knex({ client: 'pg' });

    // Fine only by accident: `date` is not a binding here.
    expect(
      (
        renderer
          .raw('SELECT :today::date', { today: '2026-03-02' })
          .toSQL() as {
          sql: string;
        }
      ).sql,
    ).toBe('SELECT ?::date');

    // The same statement once an unrelated `date` binding exists.
    const collided = renderer
      .raw('SELECT :today::date', { today: '2026-03-02', date: 'x' })
      .toSQL() as { sql: string; bindings: readonly unknown[] };
    expect(collided.sql).toBe('SELECT ?:?');
    expect(collided.bindings).toHaveLength(2);

    // The form the codebase uses instead.
    expect(
      (
        renderer
          .raw('SELECT CAST(:today AS date)', {
            today: '2026-03-02',
            date: 'x',
          })
          .toSQL() as { sql: string }
      ).sql,
    ).toBe('SELECT CAST(? AS date)');
  });

  it('breaks a plain column cast too, when the type name is also a binding', () => {
    const renderer = knex({ client: 'pg' });

    expect(
      (
        renderer.raw('SELECT sess::jsonb', { jsonb: 'x' }).toSQL() as {
          sql: string;
        }
      ).sql,
    ).toBe('SELECT sess:?');

    expect(
      (
        renderer.raw('SELECT CAST(sess AS jsonb)', { jsonb: 'x' }).toSQL() as {
          sql: string;
        }
      ).sql,
    ).toBe('SELECT CAST(sess AS jsonb)');
  });

  it('is never written with `::` in application SQL', () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(SRC_ROOT)) {
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      source.split('\n').forEach((line, index) => {
        if (DOUBLE_COLON_CAST.test(line)) {
          offenders.push(
            `${path.relative(SRC_ROOT, file)}:${index + 1} ${line.trim()}`,
          );
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
