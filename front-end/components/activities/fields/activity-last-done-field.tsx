import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Controller, useFormContext } from 'react-hook-form';
import Label from '@/components/base/label';
import Button from '@/components/base/button';
import { ThemedText } from '@/components/base/themed-text';
import InputErrorMessage from '@/components/base/input-error-message.tsx';
import type { ActivityFormValues } from '../activity-schema';
import { YYYYMMDD } from '@/utils/date';

export default function ActivityLastDoneField() {
  const { control } = useFormContext<ActivityFormValues>();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <Controller
      control={control}
      name="lastDone"
      render={({ field, fieldState }) => {
        function onChange(event: DateTimePickerEvent, date?: Date) {
          if (Platform.OS === 'android') {
            setShowPicker(false);
          }

          if (event.type !== 'dismissed' && date) {
            field.onChange(date);
          }
        }

        return (
          <View style={styles.wrapper}>
            <Label>When did you last complete this activity?</Label>

            <Pressable
              style={styles.dateField}
              onPress={() => setShowPicker(true)}
            >
              <ThemedText
                style={field.value ? styles.dateValue : styles.datePlaceholder}
              >
                {field.value ? YYYYMMDD(field.value) : '2026-07-09'}
              </ThemedText>
            </Pressable>

            {/** Clear value button **/}
            {field.value && (
              <Pressable
                onPress={() => field.onChange(null)}
                style={styles.clearDateButton}
                accessibilityRole="button"
              >
                <ThemedText style={styles.clearDateText}>
                  Clear date{' '}
                </ThemedText>
              </Pressable>
            )}

            {fieldState.error?.message && (
              <InputErrorMessage>{fieldState.error.message}</InputErrorMessage>
            )}

            {showPicker && (
              <>
                <DateTimePicker
                  value={field.value ?? new Date()}
                  mode="date"
                  maximumDate={new Date()}
                  onChange={onChange}
                />

                {Platform.OS === 'ios' && (
                  <Button
                    onPress={() => setShowPicker(false)}
                    style={styles.datePickerDone}
                  >
                    {' '}
                    Done{' '}
                  </Button>
                )}
              </>
            )}
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
  dateField: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,.055)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateValue: {
    fontSize: 16,
    color: '#fff',
  },
  datePlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  clearDateButton: {
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  clearDateText: {
    fontSize: 14,
    color: '#fff',
  },
  datePickerDone: {
    marginBottom: 16,
  },
});
