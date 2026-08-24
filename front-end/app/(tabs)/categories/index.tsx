import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import AntDesign from '@expo/vector-icons/AntDesign';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import Background from '@/components/backgrounds/background';
import { ThemedText } from '@/components/base/themed-text';
import { ICategory } from '@/api/api.categories';
import ListItemShell from '@/components/list-item-shell';
import CategoryModal, {
  CategoryFormValues,
} from '@/components/categories/category-modal';
import DeleteCategoryModal from '@/components/categories/delete-category-modal';
import LoaderScreen from '@/components/base/loader-screen';
import Dot from '@/components/dot';
import CreateCategoryModal from '@/components/categories/create-category-modal';
import FloatingActionButton from '@/components/ui/floating-action-button';
import Container from '@/components/base/container';
import { useActivitiesQuery } from '@/hooks/queries/use-activities';
import { useCategoriesQuery } from '@/hooks/queries/use-categories';
import { useEditCategoryMutation } from '@/hooks/mutations/use-category-mutations';
import { ApiError } from '@/lib/query/unwrap';
import type { ApiResponse } from '@/api/api.types';

export default function Categories() {
  const router = useRouter();
  const {
    data: activities = [],
    isPending: isActivitiesPending,
    isError: isActivitiesError,
  } = useActivitiesQuery();
  const {
    data: categories = [],
    isPending: isCategoriesPending,
    isError: isCategoriesError,
  } = useCategoriesQuery();
  const editCategory = useEditCategoryMutation();

  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ICategory | null>(
    null,
  );

  const { sortedCategories, categoryToActivityCountMap } = useMemo(() => {
    const map: Record<number, number> = {};
    categories.forEach((category) => {
      if (category.id !== undefined) {
        map[category.id] = 0;
      }
    });
    activities.forEach((activity) => {
      if (activity.categoryId) {
        map[activity.categoryId] = (map[activity.categoryId] ?? 0) + 1;
      }
    });

    const sorted = [...categories].sort(
      (a, b) => (map[b.id!] ?? 0) - (map[a.id!] ?? 0),
    );

    return { sortedCategories: sorted, categoryToActivityCountMap: map };
  }, [activities, categories]);

  function openEditModal(category: ICategory) {
    setSelectedCategory(category);
    setShowEditCategoryModal(true);
  }

  async function handleSubmit(
    values: CategoryFormValues,
  ): Promise<ApiResponse<{ category: ICategory }>> {
    if (!selectedCategory) throw new Error('No selected category');

    try {
      const category = await editCategory.mutateAsync({
        categoryId: selectedCategory.id!,
        body: {
          name: values.name,
          color: values.color,
        },
      });
      return { data: { category } };
    } catch (error) {
      if (error instanceof ApiError) {
        return { error: error.appError };
      }
      throw error;
    }
  }

  function handleSave() {
    setShowEditCategoryModal(false);
  }

  function handleDeleted() {
    setIsDeleteModalVisible(false);
    setShowEditCategoryModal(false);
  }

  function handleCreatedCategory() {
    setShowCreateCategoryModal(false);
  }

  if (isActivitiesPending || isCategoriesPending) {
    return <LoaderScreen text="Loading..." />;
  }

  if (isActivitiesError || isCategoriesError) {
    return <LoaderScreen text="Unable to load categories." />;
  }

  return (
    <View style={[{ flex: 1 }]}>
      <Background showRed={false} />

      <ScrollView>
        <Container style={styles.scrollContent}>
          <View style={styles.headlineRow}>
            <ThemedText
              style={styles.headline}
              type="defaultBold"
              size="medium"
            >
              Categories
            </ThemedText>

            <View style={styles.insightsLinks}>
              <Pressable
                onPress={() => router.push('/categories/insights')}
                style={styles.insightsLink}
              >
                <ThemedText
                  size="small"
                  type="default"
                  style={styles.insightsLinkText}
                >
                  See Insights &rarr;
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.categories}>
            {sortedCategories.length === 0 && (
              <ListItemShell style={styles.getStartedPill}>
                <View
                  style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}
                >
                  <Dot />
                  <ThemedText type="defaultBold">
                    Add your first category
                  </ThemedText>
                </View>
                <ThemedText size="extraSmall">
                  Get started by adding your first Category!
                </ThemedText>
              </ListItemShell>
            )}
            {sortedCategories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => openEditModal(category)}
              >
                <ListItemShell style={styles.category}>
                  <View style={styles.leftRow}>
                    <View style={styles.topRow}>
                      <Dot backgroundColor={category.color} />
                      <ThemedText
                        type="defaultBold"
                        style={{
                          lineHeight: 28,
                        }}
                      >
                        {category.name}
                      </ThemedText>
                    </View>
                    <View style={styles.bottomRow}>
                      <ThemedText style={styles.bottomRowText} size="small">
                        Used in{' '}
                        <ThemedText
                          style={styles.bottomRowText}
                          type="defaultBold"
                        >
                          {categoryToActivityCountMap[category.id!] || '0'}
                        </ThemedText>{' '}
                        {categoryToActivityCountMap[category.id!] > 1
                          ? 'activities'
                          : 'activity'}
                      </ThemedText>
                    </View>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 6,
                      gap: 9,
                    }}
                  >
                    <AntDesign name="edit" size={18} color="#eeed" />
                  </View>
                </ListItemShell>
              </Pressable>
            ))}
          </View>
        </Container>
      </ScrollView>

      <FloatingActionButton
        label="Create Category"
        onPress={() => setShowCreateCategoryModal(true)}
      />

      {showCreateCategoryModal && (
        <CreateCategoryModal
          onSave={handleCreatedCategory}
          onClose={() => setShowCreateCategoryModal(false)}
        />
      )}

      {showEditCategoryModal && selectedCategory && (
        <CategoryModal
          initialValues={{
            name: selectedCategory.name,
            color: selectedCategory.color,
          }}
          title={() => (
            <View style={styles.editModalTitleRow}>
              <ThemedText type="subtitle" style={styles.editModalTitle}>
                Edit Category &quot;{selectedCategory.name}&quot;
              </ThemedText>
              <Pressable onPress={() => setIsDeleteModalVisible(true)}>
                <FontAwesome6
                  style={{ padding: 6 }}
                  name="trash"
                  size={20}
                  color="white"
                />
              </Pressable>
            </View>
          )}
          onClose={() => {
            setShowEditCategoryModal(false);
            setIsDeleteModalVisible(false);
          }}
          onSubmit={handleSubmit}
          onSave={handleSave}
        />
      )}

      {selectedCategory && (
        <DeleteCategoryModal
          visible={isDeleteModalVisible}
          categoryId={selectedCategory.id!}
          onClose={() => setIsDeleteModalVisible(false)}
          onDeleted={handleDeleted}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 100,
    gap: 24,
  },
  headlineRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  headline: {
    color: '#fff',
    fontFamily: '"system-ui"',
    fontWeight: 700,
  },
  insightsLinks: {},
  insightsLink: {},
  insightsLinkText: {},
  editModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  editModalTitle: {
    flex: 1,
    marginRight: 12,
  },
  categories: {
    gap: 12,
  },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  leftRow: {
    flexGrow: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  bottomRowText: {
    fontSize: 12,
    opacity: 0.6,
  },
  settingsButton: {
    paddingVertical: 9,
    // paddingHorizontal: 9,
  },
  getStartedPill: {
    paddingTop: 14,
    paddingHorizontal: 15,
    paddingBottom: 12,
    gap: 2,
  },
});
