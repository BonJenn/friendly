import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, radii } from '@/config/theme';
import { mediumTap, heavyTap } from '@/utils/haptics';

interface CallControlsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onEndCall: () => void;
  disabled?: boolean;
}

export function CallControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  onEndCall,
  disabled = false,
}: CallControlsProps) {
  const handleRecord = () => {
    if (isRecording) {
      mediumTap();
      onStopRecording();
    } else {
      mediumTap();
      onStartRecording();
    }
  };

  const handleEnd = () => {
    heavyTap();
    onEndCall();
  };

  return (
    <View style={styles.container}>
      {/* Record / Stop button */}
      <TouchableOpacity
        style={[
          styles.recordButton,
          isRecording && styles.recordButtonActive,
          disabled && styles.disabled,
        ]}
        onPress={handleRecord}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.recordInner,
            isRecording && styles.recordInnerActive,
          ]}
        />
      </TouchableOpacity>

      <Text style={styles.hint}>
        {isRecording ? 'Tap to send' : 'Tap to talk'}
      </Text>

      {/* End call button */}
      <TouchableOpacity
        style={styles.endButton}
        onPress={handleEnd}
        activeOpacity={0.7}
      >
        <Text style={styles.endIcon}>{'✕'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgElevated,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonActive: {
    borderColor: colors.error,
    backgroundColor: 'rgba(225,112,85,0.1)',
  },
  recordInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  recordInnerActive: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.error,
  },
  hint: {
    fontSize: 14,
    color: colors.textMuted,
  },
  endButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  endIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  disabled: {
    opacity: 0.5,
  },
});
