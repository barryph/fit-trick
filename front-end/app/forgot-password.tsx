import { useState } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { authAPI } from '@/api/api.auth';
import Input from '@/components/base/input';
import Button from '@/components/base/button';
import { ThemedText } from '@/components/base/themed-text';
import Background from '@/components/backgrounds/background';
import AlertError from '@/components/alerts/alert-error';
import AlertSuccess from '@/components/alerts/alert-success';
import KBAvoidingView from '@/components/kb-avoiding-view';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from '@/components/auth/auth-schemas';

const SUCCESS_MESSAGE =
  'If an account with that email exists, a password reset link has been sent. Please check your email.';

export default function ForgotPasswordScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit({ email }: ForgotPasswordFormValues) {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authAPI.forgotPassword({ email });

    if (response.error) {
      setErrorMessage(response.error.message);
      setIsLoading(false);
      return;
    }

    setSuccessMessage(SUCCESS_MESSAGE);
    setIsLoading(false);
  }

  return (
    <KBAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Background />
        <View style={styles.formContainer}>
          <ThemedText style={styles.title} type="title">
            Forgot Password
          </ThemedText>

          {errorMessage && <AlertError>{errorMessage}</AlertError>}
          {successMessage && <AlertSuccess>{successMessage}</AlertSuccess>}

          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <Input
                label="Email"
                placeholder="Email"
                value={field.value}
                onChangeText={field.onChange}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                errorMessage={fieldState.error?.message}
                editable={!isLoading && !successMessage}
              />
            )}
          />

          <Button
            onPress={handleSubmit(onSubmit)}
            isLoading={isLoading}
            disabled={!!successMessage}
            style={styles.submitButton}
          >
            Send Reset Link
          </Button>

          <Link href="/login" style={styles.linkContainer}>
            <Text style={styles.linkText}>
              Remember your password?{' '}
              <Text style={styles.linkTextBold}>Log In</Text>
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KBAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    marginBottom: 24,
    textAlign: 'center',
    color: '#fff',
  },
  submitButton: {
    marginTop: 8,
  },
  linkContainer: {
    marginTop: 24,
    alignSelf: 'center',
  },
  linkText: {
    color: '#ddd',
    fontSize: 14,
  },
  linkTextBold: {
    color: '#0072ff',
    fontWeight: '700',
  },
});
