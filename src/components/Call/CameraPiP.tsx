import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Animated,
} from 'react-native';
import { CameraView } from 'expo-camera';
import type { CameraType } from 'expo-camera';
import { colors, radii } from '@/config/theme';
import {
  captureFrame,
  detectSignificantChange,
  FRAME_CAPTURE_INTERVAL_MS,
} from '@/services/camera';

const PIP_WIDTH = 120;
const PIP_HEIGHT = 160;
const MARGIN = 16;

interface CameraPiPProps {
  enabled: boolean;
  onFrameCaptured: (base64: string) => void;
}

export function CameraPiP({ enabled, onFrameCaptured }: CameraPiPProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const [facing, setFacing] = useState<CameraType>('front');
  const lastFrameRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Draggable position — start bottom-right
  const pan = useRef(
    new Animated.ValueXY({
      x: screenWidth - PIP_WIDTH - MARGIN,
      y: screenHeight - PIP_HEIGHT - 200, // above call controls
    })
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  const handleFlip = useCallback(() => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  // Periodic frame capture
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(async () => {
      const base64 = await captureFrame(cameraRef);
      if (!base64) return;

      if (detectSignificantChange(lastFrameRef.current, base64)) {
        lastFrameRef.current = base64;
        onFrameCaptured(base64);
      }
    }, FRAME_CAPTURE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, onFrameCaptured]);

  if (!enabled) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleFlip}
        style={styles.touchable}
      >
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          animateShutter={false}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.primary,
    zIndex: 100,
    elevation: 10,
  },
  touchable: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
});
