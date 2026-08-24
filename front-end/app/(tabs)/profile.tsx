import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import Background from '@/components/backgrounds/background';
import Container from '@/components/base/container';
import Button from '@/components/base/button';
import { ThemedText } from '@/components/base/themed-text';
import DeleteAccountModal from '@/components/auth/delete-account-modal';
import { useAuth } from '@/context/auth-context';

function Profile() {
  const { user } = useAuth();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  if (!user) return null;

  return (
    <View style={styles.container}>
      <Background showRed={false} />
      <Container style={styles.content}>
        <ThemedText style={styles.title} type="title" size="large">
          Profile
        </ThemedText>
        <View style={styles.card}>
          <ThemedText size="small" style={styles.label}>
            Email
          </ThemedText>
          <ThemedText type="defaultBold">{user.email}</ThemedText>
        </View>

        <View style={styles.dangerZone}>
          <Button
            onPress={() => setIsDeleteModalOpen(true)}
            style={styles.deleteButton}
            textStyle={styles.deleteButtonText}
          >
            Delete Account
          </Button>
        </View>
      </Container>

      <DeleteAccountModal
        visible={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  title: {
    marginTop: 10,
    marginBottom: 20,
  },
  card: {
    paddingTop: 14,
    paddingBottom: 12,
    gap: 2,
  },
  label: {
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 13,
  },
  muted: {
    opacity: 0.8,
  },
  dangerZone: {
    marginTop: 24,
  },
  deleteButton: {
    backgroundColor: '#c62828',
  },
  deleteButtonText: {
    color: '#fff',
  },
});

export default function wrapper() {
  return <Profile />;
}
