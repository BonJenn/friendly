import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '@/config/theme';

interface WaveformProps {
  active: boolean;
  color?: string;
  barCount?: number;
}

export function Waveform({
  active,
  color = colors.primary,
  barCount = 24,
}: WaveformProps) {
  const bars = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.15))
  ).current;

  useEffect(() => {
    if (active) {
      const animations = bars.map((bar, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 0.3 + Math.random() * 0.7,
              duration: 200 + Math.random() * 300,
              useNativeDriver: true,
            }),
            Animated.timing(bar, {
              toValue: 0.1 + Math.random() * 0.2,
              duration: 200 + Math.random() * 300,
              useNativeDriver: true,
            }),
          ])
        )
      );
      animations.forEach((a) => a.start());
      return () => animations.forEach((a) => a.stop());
    } else {
      bars.forEach((bar) => {
        Animated.timing(bar, {
          toValue: 0.15,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [active, bars]);

  return (
    <View style={styles.container}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    gap: 3,
  },
  bar: {
    width: 4,
    height: 60,
    borderRadius: 2,
  },
});
