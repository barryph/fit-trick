import React from 'react';
import { render, screen } from '@testing-library/react-native';
import GoalHeatmap from '../goal-heatmap';
import {
  getGoalHeatmapColor,
  GOAL_ABOVE_THRESHOLD_COLOR,
  GOAL_BELOW_THRESHOLD_COLOR,
} from '@/lib/goals/goal-colors';

describe('GoalHeatmap', () => {
  const data = [
    { weekStart: '2026-07-06', count: 2 },
    { weekStart: '2026-07-13', count: 3 },
    { weekStart: '2026-07-20', count: 5 },
  ];

  it('renders one cell per week with the right label', async () => {
    await render(<GoalHeatmap data={data} targetPerWeek={3} />);
    expect(
      screen.getByLabelText('Week of 2026-07-06: 2 completions'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Week of 2026-07-13: 3 completions'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Week of 2026-07-20: 5 completions'),
    ).toBeTruthy();
  });

  it('shows the empty state when there is no history', async () => {
    await render(<GoalHeatmap data={[]} targetPerWeek={3} />);
    expect(
      screen.getByText(
        'No completion history yet. Weeks will appear here once this activity has been completed.',
      ),
    ).toBeTruthy();
  });

  it('colors cells according to their performance relative to the target', () => {
    const color = (count: number) => getGoalHeatmapColor(count, 3);
    expect(color(2)).not.toBe(GOAL_BELOW_THRESHOLD_COLOR);
    expect(color(3)).toBe(GOAL_ABOVE_THRESHOLD_COLOR);
    expect(color(5)).toBe(GOAL_ABOVE_THRESHOLD_COLOR);
  });
});
