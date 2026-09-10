import { QueryClient } from '@tanstack/react-query';
import { unwrapApiResponse } from '@/lib/query/unwrap';
import { activitiesAPI } from '@/api/api.activity';
import { testActivities } from '@/test/setup/fixtures/activities';

jest.mock('@/api/api.activity', () => ({
  activitiesAPI: {
    getAllByUser: jest.fn(),
    getById: jest.fn(),
    createActivity: jest.fn(),
    editActivity: jest.fn(),
    deleteActivity: jest.fn(),
    complete: jest.fn(),
    undo: jest.fn(),
  },
}));

const mockGetActivities = activitiesAPI.getAllByUser as jest.Mock;

describe('query API integration', () => {
  beforeEach(() => {
    mockGetActivities.mockResolvedValue({
      data: { activities: testActivities },
    });
  });

  it('unwraps activity list responses', async () => {
    const data = await unwrapApiResponse(
      await activitiesAPI.getAllByUser('2026-07-28'),
    );
    expect(data.activities).toHaveLength(2);
  });

  it('creates an isolated query client for tests', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    expect(client).toBeDefined();
  });
});
