import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, radii } from '@/config/theme';
import { mediumTap, heavyTap } from '@/utils/haptics';
import type { CallState } from '@/screens/call/CallScreen';

interface CallControlsProps {
  callState: CallState;
  onEndCall: () => void;
  onToggleCamera?: () => void;
  cameraActive?: boolean;
}

export function CallControls({
  callState,
  onEndCall,
  onToggleCamera,
  cameraActive = false,
}: CallControlsProps) {
  const handleEnd = () => {
    heavyTap();
    onEndCall();
  };

  const handleCamera = () => {
    mediumTap();
    onToggleCamera?.();
  };

  const statusText = {
    connecting: 'Connecting...',
    listening: 'Listening...',
    recording_speech: 'Hearing you...',
    sending: 'Thinking...',
    friend_speaking: 'Speaking...',
    ending: 'Ending call...',
  }[callState];

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Camera toggle */}
        {onToggleCamera && (
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              cameraActive && styles.secondaryButtonActive,
            ]}
            onPress={handleCamera}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryIcon}>
              {cameraActive ? '📷' : '📷'}
            </Text>
          </TouchableOpacity>
        )}

        {/* End call button */}
        <TouchableOpacity
          style={styles.endButton}
          onPress={handleEnd}
          activeOpacity={0.7}
        >
          <Text style={styles.endIcon}>{'✕'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  secondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bgElevated,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0,206,201,0.1)',
  },
  secondaryIcon: {
    fontSize: 22,
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
  },
  endIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
});
