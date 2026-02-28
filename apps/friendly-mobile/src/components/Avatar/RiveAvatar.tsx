import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Rive, {
  RiveRef,
  Fit,
  Alignment,
} from 'rive-react-native';
import type { Emotion } from '@/types';

interface RiveAvatarProps {
  isSpeaking: boolean;
  emotion: Emotion;
  intensity: number;
  size?: number;
  style?: ViewStyle;
}

/*
 * PLACEHOLDER INTEGRATION
 *
 * This expects a Rive file at assets/avatar.riv with a state machine named "MainStateMachine"
 * that has the following inputs:
 *   - isSpeaking (boolean)
 *   - emotion (number: 0=calm, 1=amused, 2=caring, 3=serious, 4=hyped, 5=curious)
 *   - intensity (number: 0.0 - 1.0)
 *
 * States the state machine should have:
 *   - idle: breathing/blinking
 *   - speaking: mouth movement synced to isSpeaking
 *   - listening: attentive posture
 *   - goodbye: wave animation (triggered when emotion=3 and intensity>0.8)
 *
 * To create the Rive file:
 *   1. Go to rive.app and create a new file
 *   2. Design a 2D character (face, body, eyes, mouth)
 *   3. Add the state machine with inputs above
 *   4. Export as .riv and place at apps/friendly-mobile/src/assets/avatar.riv
 *
 * For MVP testing without a real .riv file, a placeholder view is rendered.
 */

const EMOTION_MAP: Record<Emotion, number> = {
  calm: 0,
  amused: 1,
  caring: 2,
  serious: 3,
  hyped: 4,
  curious: 5,
};

export function RiveAvatar({
  isSpeaking,
  emotion,
  intensity,
  size = 280,
  style,
}: RiveAvatarProps) {
  const riveRef = useRef<RiveRef>(null);

  useEffect(() => {
    try {
      riveRef.current?.setInputState(
        'MainStateMachine',
        'isSpeaking',
        isSpeaking
      );
    } catch {
      // Rive file not loaded yet
    }
  }, [isSpeaking]);

  useEffect(() => {
    try {
      riveRef.current?.setInputState(
        'MainStateMachine',
        'emotion',
        EMOTION_MAP[emotion]
      );
      riveRef.current?.setInputState(
        'MainStateMachine',
        'intensity',
        intensity
      );
    } catch {
      // Rive file not loaded yet
    }
  }, [emotion, intensity]);

  // Try to render the Rive avatar; fall back to a placeholder circle
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Rive
        ref={riveRef}
        resourceName="avatar"
        stateMachineName="MainStateMachine"
        fit={Fit.Contain}
        alignment={Alignment.Center}
        style={{ width: size, height: size }}
        autoplay={true}
      />
    </View>
  );
}

// Placeholder for when Rive file isn't available yet
export function AvatarPlaceholder({
  isSpeaking,
  emotion,
  size = 280,
  style,
}: Omit<RiveAvatarProps, 'intensity'> & { intensity?: number }) {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <View
        style={[
          styles.placeholder,
          {
            width: size * 0.8,
            height: size * 0.8,
            borderRadius: size * 0.4,
            borderColor: isSpeaking ? '#6C5CE7' : '#2A2A3A',
          },
        ]}
      >
        <View style={styles.face}>
          <View style={styles.eye} />
          <View style={styles.eye} />
        </View>
        <View
          style={[
            styles.mouth,
            isSpeaking && styles.mouthSpeaking,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    backgroundColor: '#1E1E2E',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    flexDirection: 'row',
    gap: 30,
    marginBottom: 20,
  },
  eye: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6C5CE7',
  },
  mouth: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6C5CE7',
  },
  mouthSpeaking: {
    height: 20,
    borderRadius: 10,
    width: 30,
  },
});
