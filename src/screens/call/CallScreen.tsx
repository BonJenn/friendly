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
  sendVoiceTurnStreaming,
  endCallSession,
  greetCall,
  CallWebSocket,
} from '@/services/api';
import * as FileSystem from 'expo-file-system';
import {
  requestMicPermission,
  startRecordingWithMetering,
  stopRecording,
  cancelRecording,
  playAudio,
  AudioQueue,
  cleanupAudioChunks,
  setPlaybackMode,
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
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const wsRef = useRef<CallWebSocket | null>(null);
  const shouldEndRef = useRef(false);

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
        if (mountedRef.current && callStateRef.current !== 'ending') {
          startListening();
        }
        return;
      }

      const sid = sessionIdRef.current;
      if (!sid) return;

      const visionFrame = pendingFrameRef.current ?? undefined;
      pendingFrameRef.current = null;

      // ─── WebSocket path: stream audio chunks as they arrive ───
      if (wsRef.current?.isConnected()) {
        // Read the recorded WAV file as base64
        const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Set up audio queue for this turn
        shouldEndRef.current = false;
        await setPlaybackMode();
        const queue = new AudioQueue(
          undefined,
          // onAllFinished — called after the last chunk plays
          () => {
            if (!mountedRef.current) return;
            if (shouldEndRef.current) {
              updateCallState('ending');
              setTimeout(() => handleEndCall(), 2000);
            } else {
              startListening();
            }
          }
        );
        audioQueueRef.current = queue;

        // Send the audio turn over WebSocket — chunks arrive via callbacks
        wsRef.current.sendAudioTurn(audioBase64, visionFrame);
        return;
      }

      // ─── REST fallback ────────────────────────────────────────
      const response = await sendVoiceTurnStreaming(sid, audioUri, visionFrame);
      if (!mountedRef.current) return;

      setEmotion(response.emotion as Emotion);
      setLastResponse(response.text);

      if (response.audioChunks && response.audioChunks.length > 0) {
        updateCallState('friend_speaking');
        await setPlaybackMode();

        const queue = new AudioQueue(
          (text) => {
            if (!mountedRef.current) return;
            setLastResponse(text);
          },
          () => {
            if (!mountedRef.current) return;
            if (response.shouldEndSession) {
              updateCallState('ending');
              setTimeout(() => handleEndCall(), 2000);
            } else {
              startListening();
            }
          }
        );
        audioQueueRef.current = queue;

        response.audioChunks.forEach((chunk, index) => {
          queue.enqueue({ base64: chunk.base64, index, text: chunk.text });
        });
      } else {
        if (response.shouldEndSession) {
          updateCallState('ending');
          setTimeout(() => handleEndCall(), 2000);
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

        // Open WebSocket for streaming audio (non-blocking — falls back to REST if it fails)
        const ws = new CallWebSocket();
        try {
          await ws.connect(sid, {
            onAudioChunk: (index, base64) => {
              if (!mountedRef.current) return;
              // Transition to friend_speaking on first chunk
              if (callStateRef.current !== 'friend_speaking') {
                updateCallState('friend_speaking');
              }
              audioQueueRef.current?.enqueue({
                base64,
                index,
                text: '',
                format: 'wav',
              });
            },
            onTurnComplete: (data) => {
              if (!mountedRef.current) return;
              setEmotion(data.emotion as Emotion);
              setLastResponse(data.text);
              shouldEndRef.current = data.shouldEndSession;
              // Signal to the queue that no more chunks are coming
              audioQueueRef.current?.markComplete();
            },
            onError: (msg) => {
              console.warn('WS error:', msg);
            },
          });
          wsRef.current = ws;
          console.log('WebSocket connected for streaming audio');
        } catch (err) {
          console.warn('WebSocket connection failed, will use REST fallback:', err);
        }

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

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clean up any active recording and audio queue
    await cancelRecording();
    if (audioQueueRef.current) {
      await audioQueueRef.current.stop();
      audioQueueRef.current = null;
    }
    cleanupAudioChunks();

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
