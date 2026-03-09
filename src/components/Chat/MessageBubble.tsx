import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { colors, spacing, radii, typography } from '@/config/theme';
import { formatTimestamp } from '@/utils/time';
import type { ChatMessage } from '@/types';

interface MessageBubbleProps {
  message: ChatMessage;
  onPlayAudio?: (url: string) => void;
}

export function MessageBubble({ message, onPlayAudio }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleFriend]}>
        <Text style={[styles.text, isUser && styles.textUser]}>
          {message.text}
        </Text>

        {message.audioUrl && (
          <TouchableOpacity
            style={styles.audioButton}
            onPress={() => onPlayAudio?.(message.audioUrl!)}
          >
            <Text style={styles.audioIcon}>{'▶'}</Text>
            <Text style={styles.audioLabel}>Voice message</Text>
          </TouchableOpacity>
        )}

        {message.imageUrl && (
          <Image
            source={{ uri: message.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        )}

        <Text style={[styles.time, isUser && styles.timeUser]}>
          {formatTimestamp(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.lg,
  },
  bubbleFriend: {
    backgroundColor: colors.bgElevated,
    borderBottomLeftRadius: radii.sm,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radii.sm,
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
  },
  textUser: {
    color: colors.white,
  },
  time: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.textMuted,
  },
  timeUser: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'right',
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  audioIcon: {
    fontSize: 14,
    color: colors.accent,
  },
  audioLabel: {
    ...typography.bodySmall,
    color: colors.accent,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
});
