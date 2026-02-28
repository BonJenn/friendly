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
import { colors, spacing, typography } from '@/config/theme';
import { useUser } from '@/context/UserContext';
import {
  startCallSession,
  sendVoiceTurn,
  endCallSession,
} from '@/services/api';
import {
  requestMicPermission,
  startRecording,
  stopRecording,
  playAudio,
} from '@/services/audio';
import { formatDuration } from '@/utils/time';
import { CALL_MAX_DURATION_SECONDS } from '@/config/constants';
import type { RootStackParamList, Emotion, AIResponse } from '@/types';

type CallRouteProp = RouteProp<RootStackParamList, 'Call'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

type CallPhase = 'connecting' | 'active' | 'ending';

export function CallScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<CallRouteProp>();
  const { profile } = useUser();

  const [phase, setPhase] = useState<CallPhase>('connecting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [friendSpeaking, setFriendSpeaking] = useState(false);
  const [emotion, setEmotion] = useState<Emotion>('calm');
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [lastResponse, setLastResponse] = useState<string>('');

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef<number>(0);

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
        setPhase('active');
        startTimeRef.current = Date.now();

        // Start elapsed timer
        timerRef.current = setInterval(() => {
          const secs = Math.floor(
            (Date.now() - startTimeRef.current) / 1000
          );
          setElapsed(secs);

          // Hard cap
          if (secs >= CALL_MAX_DURATION_SECONDS) {
            handleEndCall();
          }
        }, 1000);
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

  const handleStartRecording = useCallback(async () => {
    if (recording || processing || friendSpeaking) return;
    try {
      await startRecording();
      setRecording(true);
    } catch (err) {
      console.error('Recording start failed:', err);
    }
  }, [recording, processing, friendSpeaking]);

  const handleStopRecording = useCallback(async () => {
    if (!recording || !sessionId) return;
    setRecording(false);
    setProcessing(true);

    try {
      const audioUri = await stopRecording();
      if (!audioUri) {
        setProcessing(false);
        return;
      }

      const response: AIResponse = await sendVoiceTurn(sessionId, audioUri);

      setEmotion(response.emotion);
      setLastResponse(response.text);
      setProcessing(false);

      // Play friend's audio response
      if (response.audioUrl) {
        setFriendSpeaking(true);
        const sound = await playAudio(response.audioUrl);
        sound.setOnPlaybackStatusUpdate((status) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            setFriendSpeaking(false);
            sound.unloadAsync();
          }
        });
      }

      // If AI wants to end the call
      if (response.shouldEndSession) {
        setPhase('ending');
        setTimeout(() => {
          handleEndCall();
        }, 2000);
      }
    } catch (err) {
      console.error('Voice turn failed:', err);
      setProcessing(false);
    }
  }, [recording, sessionId]);

  const handleEndCall = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('ending');

    if (sessionId) {
      try {
        await endCallSession(sessionId);
      } catch {
        // Best effort
      }
    }

    setTimeout(() => {
      navigation.goBack();
    }, 1000);
  }, [sessionId, navigation]);

  if (!profile) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Timer */}
        <View style={styles.topBar}>
          <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
          <Text style={styles.phase}>
            {phase === 'connecting' && 'Connecting...'}
            {phase === 'active' && profile.friendNickname}
            {phase === 'ending' && 'Ending call...'}
          </Text>
        </View>

        {/* Avatar */}
        <View style={styles.avatarArea}>
          <AvatarPlaceholder
            isSpeaking={friendSpeaking}
            emotion={emotion}
            size={240}
          />
        </View>

        {/* Waveform */}
        <View style={styles.waveformArea}>
          {recording && (
            <View>
              <Text style={styles.waveformLabel}>Listening...</Text>
              <Waveform active={recording} color={colors.accent} />
            </View>
          )}
          {friendSpeaking && (
            <View>
              <Text style={styles.waveformLabel}>
                {profile.friendNickname} is talking
              </Text>
              <Waveform active={friendSpeaking} color={colors.primary} />
            </View>
          )}
          {processing && (
            <Text style={styles.processingText}>Thinking...</Text>
          )}
          {!recording && !friendSpeaking && !processing && lastResponse && (
            <Text style={styles.subtitleText} numberOfLines={3}>
              {lastResponse}
            </Text>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <CallControls
            isRecording={recording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onEndCall={handleEndCall}
            disabled={phase !== 'active' || processing || friendSpeaking}
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
