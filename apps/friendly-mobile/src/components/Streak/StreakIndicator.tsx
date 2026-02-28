import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radii, typography } from '@/config/theme';

interface StreakIndicatorProps {
  days: number;
}

export function StreakIndicator({ days }: StreakIndicatorProps) {
  if (days < 1) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.fire}>{'🔥'}</Text>
      <Text style={styles.count}>{days}</Text>
      <Text style={styles.label}>day streak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    gap: spacing.xs,
  },
  fire: {
    fontSize: 16,
  },
  count: {
    ...typography.body,
    fontWeight: '700',
    color: colors.accent,
  },
  label: {
    ...typography.caption,
  },
});
