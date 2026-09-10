import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FormProvider } from 'react-hook-form';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AlertError from '@/components/alerts/alert-error';
import Background from '@/components/backgrounds/background';
import Button from '@/components/base/button';
import { ThemedText } from '@/components/base/themed-text';
import { useActivityForm } from '@/components/activities/use-activity-form';
import ActivityCategoryField from '@/components/activities/fields/activity-category-field';
import ActivityIntervalField from '@/components/activities/fields/activity-interval-field';
import ActivityNameField from '@/components/activities/fields/activity-name-field';
import ActivityTickerField from '@/components/activities/fields/activity-ticker-field';
import ActivityGoalField from '@/components/goals/activity-goal-field';
import { ActivityFormValues } from '@/components/activities/activity-schema';
import Skeleton from '@/components/ui/skeleton';
import DeleteActivityModal from '@/components/activities/delete-activity-modal';
import { useActivityQuery } from '@/hooks/queries/use-activities';
import { useCategoriesQuery } from '@/hooks/queries/use-categories';
import { useEditActivityMutation } from '@/hooks/mutations/use-activity-mutations';
import { ApiError } from '@/lib/query/unwrap';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

export default function EditActivityPage() {
  const { id: activityId } = useLocalSearchParams();
  const activityQuery = useActivityQuery(
    isString(activityId) ? activityId : undefined,
  );
  const { data: categories = [] } = useCategoriesQuery();
  const editActivity = useEditActivityMutation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const form = useActivityForm();
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(0);
  const [dropdownRight, setDropdownRight] = useState(0);
  const [initializedForId, setInitializedForId] = useState<string | null>(null);

  const router = useRouter();

  // This screen is a tab screen, so it stays mounted when navigating between
  // activities. The form must be (re)initialized from scratch each time the
  // activity id changes, once that activity's data is available. The guard is
  // checked and set within the same effect so cached data never gets skipped.
  useEffect(() => {
    if (!activityQuery.data) return;
    if (initializedForId === String(activityId)) return;

    const activity = activityQuery.data;
    form.reset({
      name: activity.name,
      ticker: activity.ticker ?? '',
      interval: activity.interval,
      categoryId: activity.categoryId ?? null,
      goalTargetPerWeek: activity.goal?.targetPerWeek ?? null,
    });
    setInitializedForId(String(activityId));
  }, [activityId, activityQuery.data, form, initializedForId]);

  // Transient UI state must never survive a visit to this screen. A successful
  // save redirects away, and a stale error, open dropdown, or open delete modal
  // would otherwise still be showing when the page is opened again.
  const resetUiState = useCallback(() => {
    setErrorMessage(null);
    setIsSubmitting(false);
    setShowSettingsDropdown(false);
    setIsDeleteModalVisible(false);
  }, []);

  // Clear transient UI state when switching between activities.
  useEffect(() => {
    resetUiState();
  }, [activityId, resetUiState]);

  // The screen stays mounted as a tab, so opening or re-opening the page (for
  // example returning after a save) is a focus event, not a mount.
  useFocusEffect(resetUiState);

  const formReady =
    !isString(activityId) || initializedForId === String(activityId);

  async function handleSubmit(values: ActivityFormValues) {
    if (!isString(activityId)) {
      setErrorMessage('Invalid Activity ID');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await editActivity.mutateAsync({
        activityId,
        body: {
          name: values.name,
          ticker: values.ticker,
          interval: values.interval,
          categoryId: values.categoryId,
          goalTargetPerWeek: values.goalTargetPerWeek,
        },
      });
      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Something went wrong, please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const settingsToggleRef = useRef<View>(null);
  const containerRef = useRef<View>(null);

  function toggleSettingsModal() {
    if (!settingsToggleRef.current) return;
    settingsToggleRef.current.measure((x, y, width, height, pageX, pageY) => {
      if (!containerRef.current) return;
      containerRef.current.measure(
        (cX, cY, cWidth, cHeight, cPageX, cPageY) => {
          if (!showSettingsDropdown) {
            setDropdownTop(pageY - cPageY + height);
            setDropdownRight(SCREEN_WIDTH - (pageX + width));
            setShowSettingsDropdown(true);
          } else {
            setShowSettingsDropdown(false);
          }
        },
      );
    });
  }

  const initLoadErrorMessage = !isString(activityId)
    ? 'Invalid Activity ID'
    : activityQuery.isError
      ? 'Error fetching page data, please try again'
      : null;

  return (
    <View style={{ flex: 1 }} ref={containerRef}>
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
            <View style={styles.titleRow}>
              <Pressable onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={27} color="white" />
              </Pressable>
              <ThemedText type="title" size="large">
                Edit Activity
              </ThemedText>
            </View>
            <View style={styles.settingsWrapper} ref={settingsToggleRef}>
              <Pressable onPress={toggleSettingsModal}>
                <MaterialCommunityIcons
                  name="dots-vertical"
                  size={24}
                  color="white"
                  style={styles.settingsDots}
                />
              </Pressable>
            </View>
          </View>
          <View style={styles.form}>
            {initLoadErrorMessage && (
              <AlertError>{initLoadErrorMessage}</AlertError>
            )}
            {activityQuery.isPending || !formReady ? (
              <>
                <Skeleton
                  width={200}
                  height={20}
                  style={{ marginBottom: 10 }}
                />
                <Skeleton height={40} style={{ marginBottom: 20 }} />

                <Skeleton
                  width={200}
                  height={20}
                  style={{ marginBottom: 10 }}
                />
                <Skeleton height={40} style={{ marginBottom: 20 }} />

                <Skeleton
                  width={200}
                  height={20}
                  style={{ marginBottom: 10 }}
                />
                <Skeleton height={40} style={{ marginBottom: 20 }} />

                <Skeleton
                  width={200}
                  height={20}
                  style={{ marginBottom: 10 }}
                />
                <Skeleton height={40} style={{ marginBottom: 20 }} />
              </>
            ) : (
              <>
                <FormProvider {...form}>
                  <ActivityNameField />
                  <ActivityTickerField />
                  <ActivityIntervalField />

                  <ActivityCategoryField categories={categories} />
                  <ActivityGoalField />
                </FormProvider>

                {errorMessage && (
                  <View style={{ marginTop: 10 }}>
                    <AlertError>{errorMessage}</AlertError>
                  </View>
                )}

                <Button
                  isLoading={isSubmitting}
                  style={styles.submitButton}
                  onPress={form.handleSubmit(handleSubmit)}
                >
                  Save
                </Button>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </ScrollView>

      <DeleteActivityModal
        visible={isDeleteModalVisible}
        activityId={isString(activityId) ? activityId : ''}
        onClose={() => setIsDeleteModalVisible(false)}
        onDeleted={() => {
          setIsDeleteModalVisible(false);
          router.back();
        }}
      />

      {showSettingsDropdown && (
        <View
          style={[
            styles.settingsDropdown,
            { top: dropdownTop, right: dropdownRight },
          ]}
        >
          <Pressable
            style={styles.settingsDropdownItem}
            onPress={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setIsDeleteModalVisible(true);
            }}
          >
            <ThemedText style={styles.settingsDeleteButton} type="defaultBold">
              Delete
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
  },
  form: {
    zIndex: 0,
    elevation: 0,
  },
  topRow: {
    zIndex: 1,
    elevation: 1,
    marginTop: 20,
    marginBottom: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingsWrapper: {
    zIndex: 10,
    elevation: 10,
  },
  settingsDots: {
    paddingHorizontal: 8,
  },
  settingsDropdown: {
    position: 'absolute',
    width: 150,
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 999999,
    elevation: 999999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    backgroundColor: '#193b5c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  settingsDeleteButton: {
    color: 'rgba(211, 40, 40, 1)',
  },
  submitButton: {
    marginTop: 30,
  },
});
