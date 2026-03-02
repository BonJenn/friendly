import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AvatarPlaceholder } from '@/components/Avatar/RiveAvatar';
import { Waveform } from '@/components/Call/Waveform';
import { CallControls } from '@/components/Call/CallControls';
import { CameraPiP } from '@/components/Call/CameraPiP';
import { colors, spacing, typography } from '@/config/theme';
import { useUser } from '@/context/UserContext';
import {
  startCallSession,
  sendVoiceTurn,
  endCallSession,
  greetCall,
} from '@/services/api';
import {
  requestMicPermission,
  startRecordingWithMetering,
  stopRecording,
  cancelRecording,
  playAudio,
} from '@/services/audio';
import { requestCameraPermission } from '@/services/camera';
import { formatDuration } from '@/utils/time';
import { CALL_MAX_DURATION_SECONDS } from '@/config/constants';
import type { RootStackParamList, Emotion, AIResponse } from '@/types';

type CallRouteProp = RouteProp<RootStackParamList, 'Call'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export type CallState =
  | 'connecting'
  | 'listening'
  | 'recording_speech'
  | 'sending'
  | 'friend_speaking'
  | 'ending';

export function CallScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<CallRouteProp>();
  const { profile } = useUser();

  const [callState, setCallState] = useState<CallState>('connecting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<Emotion>('calm');
  const [elapsed, setElapsed] = useState(0);
  const [lastResponse, setLastResponse] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const pendingFrameRef = useRef<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const callStateRef = useRef<CallState>('connecting');
  const sessionIdRef = useRef<string | null>(null);

  // Keep refs in sync with state
  const updateCallState = useCallback((state: CallState) => {
    callStateRef.current = state;
    setCallState(state);
  }, []);

  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!mountedRef.current || callStateRef.current === 'ending') return;

    updateCallState('listening');

    try {
      await startRecordingWithMetering({
        onSpeechStart: () => {
          if (!mountedRef.current || callStateRef.current === 'ending') return;
          updateCallState('recording_speech');
        },
        onSilenceDetected: () => {
          if (!mountedRef.current || callStateRef.current === 'ending') return;
          handleSendAudio();
        },
        onMaxDurationReached: () => {
          if (!mountedRef.current || callStateRef.current === 'ending') return;
          handleSendAudio();
        },
      });
    } catch (err) {
      console.error('Failed to start listening:', err);
    }
  }, []);

  const handleSendAudio = useCallback(async () => {
    if (!mountedRef.current) return;

    updateCallState('sending');

    try {
      const audioUri = await stopRecording();
      if (!audioUri || !mountedRef.current) {
        // No audio captured — go back to listening
        if (mountedRef.current && callStateRef.current !== 'ending') {
          startListening();
        }
        return;
      }

      const sid = sessionIdRef.current;
      if (!sid) return;

      const visionFrame = pendingFrameRef.current ?? undefined;
      pendingFrameRef.current = null;
      const response: AIResponse = await sendVoiceTurn(sid, audioUri, visionFrame);

      if (!mountedRef.current) return;

      setEmotion(response.emotion);
      setLastResponse(response.text);

      if (response.audioUrl) {
        updateCallState('friend_speaking');
        const sound = await playAudio(response.audioUrl);
        sound.setOnPlaybackStatusUpdate((status) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            sound.unloadAsync();
            if (!mountedRef.current) return;

            if (response.shouldEndSession) {
              updateCallState('ending');
              setTimeout(() => {
                handleEndCall();
              }, 2000);
            } else {
              startListening();
            }
          }
        });
      } else {
        // No audio in response — resume listening
        if (response.shouldEndSession) {
          updateCallState('ending');
          setTimeout(() => {
            handleEndCall();
          }, 2000);
        } else {
          startListening();
        }
      }
    } catch (err) {
      console.error('Voice turn failed:', err);
      if (mountedRef.current && callStateRef.current !== 'ending') {
        startListening();
      }
    }
  }, []);

  // Initialize call
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const hasPermission = await requestMicPermission();
      if (!hasPermission) {
        Alert.alert(
          'Microphone Required',
          'Friendly needs microphone access for calls.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }

      try {
        const { sessionId: sid } = await startCallSession();
        if (cancelled) return;
        setSessionId(sid);
        startTimeRef.current = Date.now();

        // Start elapsed timer
        timerRef.current = setInterval(() => {
          const secs = Math.floor(
            (Date.now() - startTimeRef.current) / 1000
          );
          setElapsed(secs);

          if (secs >= CALL_MAX_DURATION_SECONDS) {
            handleEndCall();
          }
        }, 1000);

        // Friend "picks up" with a greeting
        try {
          const greeting = await greetCall(sid);
          if (cancelled) return;
          setEmotion(greeting.emotion);
          setLastResponse(greeting.text);
          if (greeting.audioUrl) {
            updateCallState('friend_speaking');
            const sound = await playAudio(greeting.audioUrl);
            sound.setOnPlaybackStatusUpdate((status) => {
              if ('didJustFinish' in status && status.didJustFinish) {
                sound.unloadAsync();
                if (!cancelled && mountedRef.current) {
                  startListening();
                }
              }
            });
          } else {
            // No greeting audio — start listening immediately
            startListening();
          }
        } catch (greetErr) {
          console.error('Greeting failed:', greetErr);
          // Still start listening even if greeting fails
          if (!cancelled && mountedRef.current) {
            startListening();
          }
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert('Connection Failed', 'Could not start the call.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleToggleCamera = useCallback(async () => {
    if (cameraActive) {
      setCameraActive(false);
      pendingFrameRef.current = null;
      return;
    }

    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Camera Permission',
        'Friendly needs camera access so your friend can see the world with you.',
        [{ text: 'OK' }]
      );
      return;
    }
    setCameraActive(true);
  }, [cameraActive]);

  const handleFrameCaptured = useCallback((base64: string) => {
    pendingFrameRef.current = base64;
  }, []);

  const handleEndCall = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    updateCallState('ending');

    // Clean up any active recording
    await cancelRecording();

    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await endCallSession(sid);
      } catch {
        // Best effort
      }
    }

    setTimeout(() => {
      navigation.goBack();
    }, 1000);
  }, [navigation]);

  if (!profile) return null;

  const isListeningOrRecording =
    callState === 'listening' || callState === 'recording_speech';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Camera PiP overlay */}
        <CameraPiP
          enabled={cameraActive}
          onFrameCaptured={handleFrameCaptured}
        />

        {/* Timer */}
        <View style={styles.topBar}>
          <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
          <Text style={styles.phase}>
            {callState === 'connecting' && 'Connecting...'}
            {callState !== 'connecting' &&
              callState !== 'ending' &&
              profile.friendNickname}
            {callState === 'ending' && 'Ending call...'}
          </Text>
        </View>

        {/* Avatar */}
        <View style={styles.avatarArea}>
          <AvatarPlaceholder
            isSpeaking={callState === 'friend_speaking'}
            emotion={emotion}
            size={240}
          />
        </View>

        {/* Waveform */}
        <View style={styles.waveformArea}>
          {isListeningOrRecording && (
            <View>
              <Text style={styles.waveformLabel}>
                {callState === 'recording_speech'
                  ? 'Listening...'
                  : 'Your turn...'}
              </Text>
              <Waveform
                active={callState === 'recording_speech'}
                color={colors.accent}
              />
            </View>
          )}
          {callState === 'friend_speaking' && (
            <View>
              <Text style={styles.waveformLabel}>
                {profile.friendNickname} is talking
              </Text>
              <Waveform active color={colors.primary} />
            </View>
          )}
          {callState === 'sending' && (
            <Text style={styles.processingText}>Thinking...</Text>
          )}
          {!isListeningOrRecording &&
            callState !== 'friend_speaking' &&
            callState !== 'sending' &&
            lastResponse && (
              <Text style={styles.subtitleText} numberOfLines={3}>
                {lastResponse}
              </Text>
            )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <CallControls
            callState={callState}
            onEndCall={handleEndCall}
            onToggleCamera={handleToggleCamera}
            cameraActive={cameraActive}
          />
        </View>
      </View>
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
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  timer: {
    ...typography.h2,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  phase: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
  },
  avatarArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformArea: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveformLabel: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  processingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  subtitleText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  controls: {
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
});
