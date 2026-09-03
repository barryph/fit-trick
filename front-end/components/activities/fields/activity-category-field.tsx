import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Controller, useFormContext } from 'react-hook-form';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import Label from '@/components/base/label';
import InputErrorMessage from '@/components/base/input-error-message.tsx';
import { ThemedText } from '@/components/base/themed-text';
import CreateCategoryModal from '@/components/categories/create-category-modal';
import Dot from '@/components/dot';
import type { ICategory } from '@/api/api.categories';
import type { ActivityFormValues } from '../activity-schema';

interface Props {
  categories: ICategory[];
}

export default function ActivityCategoryField({ categories }: Props) {
  const { control } = useFormContext<ActivityFormValues>();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);

  return (
    <Controller
      control={control}
      name="categoryId"
      render={({ field, fieldState }) => {
        const selected = categories.find(
          (category) => category.id === field.value,
        );

        const selectCategory = (category: ICategory) => {
          field.onChange(category.id);
          sheetRef.current?.dismiss();
        };

        return (
          <View style={styles.wrapper}>
            <Label>Category</Label>
            <Pressable
              onPress={() => sheetRef.current?.present()}
              style={styles.select}
              accessibilityRole="button"
              accessibilityLabel="Category"
            >
              {selected ? (
                <View style={styles.selectedRow}>
                  <Dot backgroundColor={selected.color} />
                  <ThemedText style={styles.selectText} selectable={false}>
                    {selected.name}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.placeholderText} selectable={false}>
                  Choose a Category
                </ThemedText>
              )}
              <ThemedText style={styles.arrow} selectable={false}>
                ›
              </ThemedText>
            </Pressable>

            {selected && (
              <Pressable
                onPress={() => field.onChange(null)}
                style={styles.clearCategoryButton}
                accessibilityRole="button"
              >
                <ThemedText style={styles.clearCategoryText}>
                  Clear category
                </ThemedText>
              </Pressable>
            )}

            {fieldState.error?.message && (
              <InputErrorMessage>{fieldState.error.message}</InputErrorMessage>
            )}

            <BottomSheetModal
              ref={sheetRef}
              index={0}
              snapPoints={['60%']}
              backgroundStyle={styles.sheetBackground}
              handleIndicatorStyle={styles.sheetHandle}
            >
              <BottomSheetScrollView
                contentContainerStyle={styles.sheetContent}
              >
                <Pressable
                  style={styles.createButton}
                  onPress={() => setShowCreateCategoryModal(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Create Category"
                >
                  <ThemedText type="defaultSemiBold">
                    + Create Category
                  </ThemedText>
                </Pressable>

                {categories.length === 0 ? (
                  <ThemedText style={styles.emptyText}>
                    No categories yet. Create one above.
                  </ThemedText>
                ) : (
                  categories.map((category) => {
                    const isSelected = category.id === field.value;
                    return (
                      <Pressable
                        key={String(category.id ?? category.name)}
                        style={styles.sheetItem}
                        onPress={() => selectCategory(category)}
                        accessibilityRole="button"
                        accessibilityLabel={category.name}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Dot backgroundColor={category.color} />
                        <ThemedText
                          style={styles.sheetItemText}
                          type={isSelected ? 'defaultSemiBold' : 'default'}
                        >
                          {category.name}
                        </ThemedText>
                        {isSelected && (
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </BottomSheetScrollView>
            </BottomSheetModal>

            {showCreateCategoryModal && (
              <CreateCategoryModal
                onSave={(category) => {
                  setShowCreateCategoryModal(false);
                  field.onChange(category.id);
                  sheetRef.current?.dismiss();
                }}
                onClose={() => setShowCreateCategoryModal(false)}
              />
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
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectText: {
    fontSize: 16,
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    flex: 1,
  },
  arrow: {
    fontSize: 20,
    color: '#999',
    transform: [{ rotate: '90deg' }],
  },
  clearCategoryButton: {
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  clearCategoryText: {
    fontSize: 14,
    color: '#fff',
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
  createButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 4,
  },
  emptyText: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#999',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetItemText: {
    flex: 1,
  },
});
