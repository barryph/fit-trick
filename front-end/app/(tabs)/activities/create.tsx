import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FormProvider } from 'react-hook-form';
import Ionicons from '@expo/vector-icons/Ionicons';
import AlertError from '@/components/alerts/alert-error';
import Background from '@/components/backgrounds/background';
import Button from '@/components/base/button';
import { ThemedText } from '@/components/base/themed-text';
import { useActivityForm } from '@/components/activities/use-activity-form';
import ActivityCategoryField from '@/components/activities/fields/activity-category-field';
import ActivityIntervalField from '@/components/activities/fields/activity-interval-field';
import ActivityNameField from '@/components/activities/fields/activity-name-field';
import ActivityTickerField from '@/components/activities/fields/activity-ticker-field';
import ActivityLastDoneField from '@/components/activities/fields/activity-last-done-field';
import ActivityGoalField from '@/components/goals/activity-goal-field';
import { ActivityFormValues } from '@/components/activities/activity-schema';
import { useCategoriesQuery } from '@/hooks/queries/use-categories';
import { useCreateActivityMutation } from '@/hooks/mutations/use-activity-mutations';
import { formatDateISO } from '@/utils/date';
import { ApiError } from '@/lib/query/unwrap';

export default function CreateActivityPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useActivityForm();
  const { data: categories = [] } = useCategoriesQuery();
  const createActivity = useCreateActivityMutation();

  async function handleSubmit(values: ActivityFormValues) {
    setErrorMessage(null);

    try {
      await createActivity.mutateAsync({
        name: values.name,
        ticker: values.ticker,
        interval: values.interval,
        lastDone: values.lastDone ? formatDateISO(values.lastDone) : undefined,
        ...(values.categoryId && {
          categoryId: values.categoryId,
        }),
        goalTargetPerWeek: values.goalTargetPerWeek,
      });
      form.reset();
      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage('Something went wrong, please try again.');
    }
  }

  return (
    <View style={styles.container}>
      <Background />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="arrow-back" size={27} color="white" />
            </Pressable>
            <ThemedText weight="700" size="large">
              New Activity
            </ThemedText>
          </View>

          <FormProvider {...form}>
            <ActivityNameField />
            <ActivityTickerField />
            <ActivityIntervalField />

            <ActivityCategoryField categories={categories} />

            <ActivityLastDoneField />
            <ActivityGoalField />
          </FormProvider>

          {errorMessage && (
            <View style={{ marginTop: 10 }}>
              <AlertError>{errorMessage}</AlertError>
            </View>
          )}

          <Button
            isLoading={createActivity.isPending}
            style={styles.submitButton}
            onPress={form.handleSubmit(handleSubmit)}
          >
            Create
          </Button>
        </KeyboardAvoidingView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
  },
  topRow: {
    marginTop: 15,
    marginBottom: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  submitButton: {
    marginTop: 15,
  },
});
