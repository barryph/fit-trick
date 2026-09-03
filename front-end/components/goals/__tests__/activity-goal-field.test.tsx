import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FormProvider, useForm } from 'react-hook-form';
import type { ActivityFormValues } from '@/components/activities/activity-schema';
import ActivityGoalField from '../activity-goal-field';

function Harness({
  initialGoal,
}: {
  initialGoal?: ActivityFormValues['goalTargetPerWeek'];
}) {
  const form = useForm<ActivityFormValues>({
    defaultValues: {
      name: '',
      ticker: '',
      interval: 1,
      categoryId: null,
      lastDone: null,
      goalTargetPerWeek: initialGoal ?? null,
    },
  });

  return (
    <FormProvider {...form}>
      <ActivityGoalField />
    </FormProvider>
  );
}

describe('ActivityGoalField', () => {
  it('renders the label and defaults to No goal', async () => {
    await render(<Harness />);
    expect(screen.getByText('How many times per week?')).toBeTruthy();
    expect(screen.getByText('No goal')).toBeTruthy();
  });

  it('loads an existing goal', async () => {
    await render(<Harness initialGoal={5} />);
    expect(screen.getByText('5 Times Per Week')).toBeTruthy();
  });

  it('shows all options when the sheet is opened', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByText('No goal'));
    expect(screen.getByText('1 Time Per Week')).toBeTruthy();
    expect(screen.getByText('3 Times Per Week')).toBeTruthy();
    expect(screen.getByText('7 Times Per Week')).toBeTruthy();
  });

  it('marks the currently selected goal as selected when opened', async () => {
    await render(<Harness initialGoal={3} />);
    await fireEvent.press(screen.getByText('3 Times Per Week'));
    const selected = screen.getByRole('button', {
      name: '3 Times Per Week',
      selected: true,
    });
    expect(selected).toBeTruthy();
  });

  it('selects a frequency and closes the sheet', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByText('No goal'));
    await fireEvent.press(screen.getByText('3 Times Per Week'));
    expect(screen.getByText('3 Times Per Week')).toBeTruthy();
    expect(screen.queryByText('1 Time Per Week')).toBeNull();
    expect(screen.queryByText('7 Times Per Week')).toBeNull();
  });
});
