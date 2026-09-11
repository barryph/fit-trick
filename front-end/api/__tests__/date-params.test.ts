/**
 * The API contract for calendar dates.
 *
 * Every date-sensitive endpoint requires the client's own local date as a
 * `YYYY-MM-DD` string. These tests pin the client's half of it: the value sent
 * is the device's local calendar date, verbatim, and never an instant (an ISO
 * timestamp or epoch) that the server would have to interpret in *its*
 * timezone.
 */
import { activitiesAPI } from '../api.activity';
import { goalsAPI } from '../api.goals';
import { timelineAPI } from '../api.timeline';
import { activityEventsAPI } from '../api.events';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function lastUrl(): string {
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
}

/**
 * A device at UTC+13 whose local date is a Monday, while a UTC API host is
 * still on the Sunday before it.
 */
const DEVICE_TODAY = '2026-03-02';
const UTC_TODAY = '2026-03-01';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T/;

describe('date parameters sent to the API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(() =>
      jsonResponse({ data: { activities: [], activity: {}, goals: [] } }),
    );
  });

  it('sends the device date on the activities list', async () => {
    await activitiesAPI.getAllByUser(DEVICE_TODAY);

    expect(lastUrl()).toBe(
      `http://localhost:3000/activities?today=${DEVICE_TODAY}`,
    );
  });

  it('sends the device date on every activity read and write', async () => {
    await activitiesAPI.getById(7, DEVICE_TODAY);
    expect(lastUrl()).toBe(
      `http://localhost:3000/activities/7?today=${DEVICE_TODAY}`,
    );

    await activitiesAPI.createActivity({ name: 'Run', interval: 1 }, DEVICE_TODAY);
    expect(lastUrl()).toBe(
      `http://localhost:3000/activities?today=${DEVICE_TODAY}`,
    );

    await activitiesAPI.editActivity(7, { name: 'Sprint' }, DEVICE_TODAY);
    expect(lastUrl()).toBe(
      `http://localhost:3000/activities/edit/7?today=${DEVICE_TODAY}`,
    );

    await activitiesAPI.complete(7, DEVICE_TODAY, DEVICE_TODAY);
    expect(lastUrl()).toBe(
      `http://localhost:3000/activities/7/complete?today=${DEVICE_TODAY}`,
    );

    await activitiesAPI.undo(7, UTC_TODAY, DEVICE_TODAY);
    expect(lastUrl()).toBe(
      `http://localhost:3000/activities/7/undo?today=${DEVICE_TODAY}`,
    );

    await activitiesAPI.deleteActivity(7, DEVICE_TODAY);
    expect(lastUrl()).toBe(
      `http://localhost:3000/activities/7?today=${DEVICE_TODAY}`,
    );
  });

  it('sends the device date on every goal query', async () => {
    await goalsAPI.getAll(DEVICE_TODAY);
    expect(lastUrl()).toBe(`http://localhost:3000/goals?today=${DEVICE_TODAY}`);

    await goalsAPI.getStats(7, DEVICE_TODAY);
    expect(lastUrl()).toBe(
      `http://localhost:3000/goals/7?today=${DEVICE_TODAY}`,
    );
  });

  it('stays on the device date when the server is on a different day', async () => {
    // The completion belongs to the device's calendar, not the host's.
    await activitiesAPI.complete(7, DEVICE_TODAY, DEVICE_TODAY);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`today=${DEVICE_TODAY}`);
    expect(url).not.toContain(UTC_TODAY);
    expect(JSON.parse(init.body as string)).toEqual({ date: DEVICE_TODAY });
  });

  it('never sends an instant where a calendar date is expected', async () => {
    await activitiesAPI.getAllByUser(DEVICE_TODAY);
    await activitiesAPI.complete(7, DEVICE_TODAY, DEVICE_TODAY);
    await goalsAPI.getAll(DEVICE_TODAY);
    await timelineAPI.getTimeline('2026-03');
    await activityEventsAPI.getEvents('2026-03-02', '2026-03-08');

    for (const [url] of mockFetch.mock.calls) {
      const sent = decodeURIComponent(String(url));
      expect(sent).not.toMatch(ISO_INSTANT);
      expect(sent).not.toMatch(/[?&]date=\d{4}-\d{2}-\d{2}T/);
      expect(sent).not.toMatch(/[?&]today=\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('passes explicit ranges through unchanged', async () => {
    await timelineAPI.getTimeline('2026-03');
    expect(lastUrl()).toBe(
      'http://localhost:3000/activities/timeline?month=2026-03',
    );

    await activityEventsAPI.getEvents('2026-02-23', '2026-03-02');
    expect(lastUrl()).toBe(
      'http://localhost:3000/activities/events?from=2026-02-23&to=2026-03-02',
    );
  });
});
