import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { DatabaseModule } from '../../../shared/knex/database.module';
import { GetActivityByIdQuery } from './getActivityById.query';
import { GetActivityTimelineQuery } from './getActivityTimeline.query';
import { KnexService } from '../../../shared/knex/knex.service';
import { insertUserWithKnex } from '../../../../test/factories/user.factory';
import { insertActivity } from '../../../../test/factories/activity.factory';
import { insertActivityEvent } from '../../../../test/factories/activity-event.factory';

/**
 * The query is anchored to the client's local date, so callers pass both the
 * goal week range and `today` - the Mon-Sun week of `2026-08-03` contains it.
 */
const TODAY = '2026-08-05';

describe('Activity queries (integration)', () => {
  let getActivityByIdQuery: GetActivityByIdQuery;
  let getActivityTimelineQuery: GetActivityTimelineQuery;
  let knexService: KnexService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [GetActivityByIdQuery, GetActivityTimelineQuery],
    }).compile();

    getActivityByIdQuery = moduleRef.get(GetActivityByIdQuery);
    getActivityTimelineQuery = moduleRef.get(GetActivityTimelineQuery);
    knexService = moduleRef.get(KnexService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('rejects access when user does not own activity', async () => {
    const owner = await insertUserWithKnex(knexService);
    const ownerId = owner.id as string;
    const other = await insertUserWithKnex(knexService, {
      email: 'other@example.com',
    });
    const otherId = other.id as string;
    const activity = await insertActivity(knexService, { userId: ownerId });
    const activityId = activity.id as string;

    await expect(
      getActivityByIdQuery.execute(
        activityId,
        otherId,
        { from: '2026-08-03', to: '2026-08-09' },
        TODAY,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns timeline dates for the requested month', async () => {
    const user = await insertUserWithKnex(knexService);
    const userId = user.id as string;
    const activity = await insertActivity(knexService, { userId });
    const activityId = activity.id as string;
    await insertActivityEvent(knexService, {
      activityId,
      date: '2026-03-05',
    });
    await insertActivityEvent(knexService, {
      activityId,
      date: '2026-03-12',
    });

    const timeline = await getActivityTimelineQuery.execute(userId, '2026-03');

    expect(timeline[activityId]).toEqual(
      expect.arrayContaining(['2026-03-05', '2026-03-12']),
    );
  });
});
