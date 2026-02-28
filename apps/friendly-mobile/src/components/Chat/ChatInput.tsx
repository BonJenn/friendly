import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, radii, typography } from '@/config/theme';
import { MESSAGE_INPUT_MAX_LENGTH } from '@/config/constants';
import { lightTap } from '@/utils/haptics';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  loading = false,
  placeholder = 'Message your friend...',
}: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || loading) return;
    lightTap();
    onSend(trimmed);
    setText('');
  };

  const canSend = text.trim().length > 0 && !disabled && !loading;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={MESSAGE_INPUT_MAX_LENGTH}
        multiline
        editable={!disabled}
        returnKeyType="send"
        onSubmitEditing={handleSend}
        blurOnSubmit
      />
      <TouchableOpacity
        style={[styles.sendButton, canSend && styles.sendButtonActive]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={[styles.sendIcon, canSend && styles.sendIconActive]}>
            {'↑'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: colors.primary,
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textMuted,
  },
  sendIconActive: {
    color: colors.white,
  },
});
