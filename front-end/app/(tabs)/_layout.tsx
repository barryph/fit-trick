import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Feather from '@expo/vector-icons/Feather';

import { HapticTab } from '@/components/base/haptic-tab';
import { Colors } from '@/constants/theme';
import BlueBackground from '@/components/backgrounds/blue-background';
import Logo from '@/components/logo';

export default function TabLayout() {
  const router = useRouter();

  const headerOptions = {
    headerShown: true,
    headerStyle: {
      paddingVertical: 40,
    },

    header: () => (
      <SafeAreaView edges={['top']} style={styles.header}>
        <BlueBackground />
        <Logo />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          hitSlop={8}
          onPress={() => router.push('/profile')}
          style={styles.headerButton}
        >
          <MaterialIcons name="account-circle" size={24} color="#d8ecff" />
        </Pressable>
      </SafeAreaView>
    ),
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#fff',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: Colors.dark.navbar,
          borderTopWidth: 0,
        },
      }}
      backBehavior="history"
    >
      <Tabs.Screen
        name="index"
        options={{
          ...headerOptions,
          title: 'Activities',
          tabBarIcon: ({ color }) => (
            <Feather name="activity" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="categories/index"
        options={{
          ...headerOptions,
          title: 'Categories',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="layer-group" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories/insights"
        options={{
          ...headerOptions,
          title: 'Category Insights',
          href: null,
        }}
      />

      <Tabs.Screen
        name="timeline"
        options={{
          ...headerOptions,
          title: 'Timeline',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="timeline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="goals/index"
        options={{
          ...headerOptions,
          title: 'Goals',
          tabBarIcon: ({ color }) => (
            <Feather name="target" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="goals/[activityId]"
        options={{
          ...headerOptions,
          title: 'Goal Insights',
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          ...headerOptions,
          href: null,
        }}
      />

      <Tabs.Screen
        name="activities/insights"
        options={{
          ...headerOptions,
          title: 'Activity Insights',
          href: null,
        }}
      />
      <Tabs.Screen
        name="activities/create"
        options={{
          ...headerOptions,
          title: 'New Activity',
          href: null,
        }}
      />
      <Tabs.Screen
        name="activities/edit/[id]"
        options={{
          ...headerOptions,
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerButton: {
    backgroundColor: 'rgba(255,255,255,.11)',
    borderRadius: 12,
    height: 40,
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
