import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Controller, useFormContext } from 'react-hook-form';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import Label from '@/components/base/label';
import InputErrorMessage from '@/components/base/input-error-message.tsx';
import { ThemedText } from '@/components/base/themed-text';
import type { ActivityFormValues } from '../activities/activity-schema';

const GOAL_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No goal' },
  ...Array.from({ length: 7 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1} ${i === 0 ? 'Time' : 'Times'} Per Week`,
  })),
];

export default function ActivityGoalField() {
  const { control } = useFormContext<ActivityFormValues>();
  const sheetRef = useRef<BottomSheetModal>(null);

  // Backdrop allows us to close the modal on outside click
  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} />,
    [],
  );

  return (
    <Controller
      control={control}
      name="goalTargetPerWeek"
      render={({ field, fieldState }) => {
        const selected = GOAL_OPTIONS.find(
          (option) => option.value === field.value,
        );

        const selectOption = (option: (typeof GOAL_OPTIONS)[number]) => {
          field.onChange(option.value);
          sheetRef.current?.dismiss();
        };

        return (
          <View style={styles.wrapper}>
            <Label>How many times per week?</Label>
            <Pressable
              onPress={() => sheetRef.current?.present()}
              style={styles.select}
              accessibilityRole="button"
              accessibilityLabel="Goal frequency"
            >
              <ThemedText
                style={
                  selected?.value === null ? styles.placeholder : undefined
                }
                selectable={false}
              >
                {selected?.label ?? 'No goal'}
              </ThemedText>
              <ThemedText style={styles.arrow} selectable={false}>
                ›
              </ThemedText>
            </Pressable>

            {fieldState.error?.message && (
              <InputErrorMessage>{fieldState.error.message}</InputErrorMessage>
            )}

            <BottomSheetModal
              ref={sheetRef}
              index={0}
              snapPoints={['50%']}
              backgroundStyle={styles.sheetBackground}
              handleIndicatorStyle={styles.sheetHandle}
              backdropComponent={renderBackdrop}
            >
              <BottomSheetView style={styles.sheetContent}>
                {GOAL_OPTIONS.map((option) => {
                  const isSelected = option.value === field.value;
                  return (
                    <Pressable
                      key={String(option.value)}
                      style={styles.sheetItem}
                      onPress={() => selectOption(option)}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <ThemedText
                        style={styles.sheetItemText}
                        type={isSelected ? 'defaultSemiBold' : 'default'}
                      >
                        {option.label}
                      </ThemedText>
                      {isSelected && (
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      )}
                    </Pressable>
                  );
                })}
              </BottomSheetView>
            </BottomSheetModal>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
    width: '100%',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,.055)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  placeholder: {
    color: '#999',
  },
  arrow: {
    fontSize: 20,
    color: '#999',
    transform: [{ rotate: '90deg' }],
  },
  sheetBackground: {
    backgroundColor: 'rgb(22, 50, 81)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetHandle: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  sheetContent: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetItemText: {
    flex: 1,
  },
});
