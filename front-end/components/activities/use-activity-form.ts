import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { activitySchema, type ActivityFormValues } from './activity-schema';

export function useActivityForm(initialValues?: Partial<ActivityFormValues>) {
  // `interval` is a text field that the schema coerces, so the form's input type
  // is not the same as its parsed output type; naming all three generics lets
  // handleSubmit receive the coerced ActivityFormValues.
  return useForm<
    z.input<typeof activitySchema>,
    unknown,
    z.output<typeof activitySchema>
  >({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      name: '',
      ticker: '',
      interval: 1,
      categoryId: null,
      lastDone: null,
      goalTargetPerWeek: null,
      ...initialValues,
    },
  });
}
