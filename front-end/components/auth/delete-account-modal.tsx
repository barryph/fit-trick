import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Button from '@/components/base/button';
import { ThemedText } from '@/components/base/themed-text';
import Background from '@/components/backgrounds/background';
import AlertError from '@/components/alerts/alert-error';
import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/lib/query/unwrap';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Confirmation step for account deletion. Deletion is destructive and
 * irreversible, so the user must explicitly confirm; the warning makes the
 * consequences unambiguous. The backend derives the account to delete from the
 * session alone — this screen never sends (or knows) an account identifier.
 */
export default function DeleteAccountModal({
  visible,
  onClose,
}: DeleteAccountModalProps) {
  const { deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setIsDeleting(false);
      setErrorMessage(null);
    }
  }, [visible]);

  function handleClose() {
    if (isDeleting) return;
    setErrorMessage(null);
    onClose();
  }

  async function handleDelete() {
    if (isDeleting) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteAccount();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Something went wrong, please try again.');
      }
      setIsDeleting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdropFill}
          onPress={handleClose}
          disabled={isDeleting}
        />
        <View style={styles.card}>
          <Background />
          <ThemedText type="subtitle" style={styles.title}>
            Delete Account
          </ThemedText>
          <ThemedText style={styles.message}>
            Deleting your account will permanently remove your account, your
            activities, your history and all of your data. This cannot be
            undone.
          </ThemedText>

          {errorMessage ? (
            <View style={{ marginTop: 10 }}>
              <AlertError>{errorMessage}</AlertError>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              disabled={isDeleting}
              onPress={handleClose}
              style={styles.actionButton}
            >
              Cancel
            </Button>
            <Button
              isLoading={isDeleting}
              onPress={handleDelete}
              style={[styles.actionButton, styles.deleteButton]}
              textStyle={styles.deleteButtonText}
            >
              Delete
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    zIndex: 1,
    overflow: 'hidden',
  },
  title: {
    marginTop: 8,
    marginBottom: 12,
  },
  message: {
    lineHeight: 22,
    color: '#ccc',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
  },
  deleteButton: {
    backgroundColor: '#c62828',
  },
  deleteButtonText: {
    color: '#fff',
  },
});
