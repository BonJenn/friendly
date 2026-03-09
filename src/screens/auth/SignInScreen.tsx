import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Common/Button';
import { colors, spacing, radii, typography } from '@/config/theme';
import { signInWithApple, signInWithEmail, signUpWithEmail } from '@/services/auth';

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      Alert.alert('Auth Error', err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithApple();
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Auth Error', err.message ?? 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>friendly</Text>
          <Text style={styles.tagline}>Your AI best friend</Text>
        </View>

        <View style={styles.form}>
          {Platform.OS === 'ios' && (
            <>
              <Button
                title="Continue with Apple"
                onPress={handleAppleSignIn}
                variant="secondary"
                size="lg"
                loading={loading}
                style={styles.appleButton}
              />
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={isSignUp ? 'newPassword' : 'password'}
          />

          <Button
            title={isSignUp ? 'Create Account' : 'Sign In'}
            onPress={handleEmailAuth}
            size="lg"
            loading={loading}
          />

          <Button
            title={isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            onPress={() => setIsSignUp(!isSignUp)}
            variant="ghost"
            size="sm"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -1,
  },
  tagline: {
    ...typography.bodySmall,
    marginTop: spacing.sm,
  },
  form: {
    gap: spacing.md,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appleButton: {
    backgroundColor: colors.white,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
  },
});
