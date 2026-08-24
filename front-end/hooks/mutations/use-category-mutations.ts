import { useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesAPI, type ICategory } from '@/api/api.categories';
import { queryKeys } from '@/lib/query/keys';
import { unwrapApiResponse } from '@/lib/query/unwrap';

function updateCategoriesCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (categories: ICategory[]) => ICategory[],
) {
  queryClient.setQueryData<ICategory[]>(queryKeys.categories.all, (current) =>
    current ? updater(current) : current,
  );
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      body: Parameters<typeof categoriesAPI.createCategory>[0],
    ) => {
      const resp = await categoriesAPI.createCategory(body);
      const data = unwrapApiResponse(resp);
      return data.category;
    },
    onSuccess: (category) => {
      updateCategoriesCache(queryClient, (categories) => [
        ...categories,
        category,
      ]);
    },
  });
}

export function useEditCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      categoryId,
      body,
    }: {
      categoryId: number | string;
      body: Parameters<typeof categoriesAPI.editCategory>[1];
    }) => {
      const resp = await categoriesAPI.editCategory(categoryId, body);
      const data = await unwrapApiResponse(resp);
      return data.category;
    },
    onSuccess: (category) => {
      updateCategoriesCache(queryClient, (categories) =>
        categories.map((item) => (item.id === category.id ? category : item)),
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activities.all,
      });
      // The goals list embeds the category color; refresh it on color changes.
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals.base });
    },
  });
}

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryId: number | string) => {
      const resp = await categoriesAPI.deleteCategory(categoryId);
      const data = await unwrapApiResponse(resp);
      return data.id;
    },
    onSuccess: (categoryId) => {
      updateCategoriesCache(queryClient, (categories) =>
        categories.filter((item) => String(item.id) !== String(categoryId)),
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activities.all,
      });
      // The goals list embeds the category color; refresh it when the
      // category (and therefore the color) disappears.
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals.base });
    },
  });
}
