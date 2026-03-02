import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import {
  RECORDING_MAX_DURATION_MS,
  SILENCE_THRESHOLD_DB,
  SILENCE_DURATION_MS,
  METERING_POLL_INTERVAL_MS,
  MIN_SPEECH_DURATION_MS,
} from '@/config/constants';

// Record in M4A format — compatible with OpenAI Whisper STT
const WHISPER_RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

let recording: Audio.Recording | null = null;
let meteringInterval: ReturnType<typeof setInterval> | null = null;

export interface MeteringCallbacks {
  onSpeechStart: () => void;
  onSilenceDetected: () => void;
  onMaxDurationReached: () => void;
}

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

export async function startRecordingWithMetering(
  callbacks: MeteringCallbacks
): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording: rec } = await Audio.Recording.createAsync(
    WHISPER_RECORDING_OPTIONS
  );
  recording = rec;

  let speechDetected = false;
  let speechStartTime = 0;
  let silenceStartTime = 0;
  const recordingStartTime = Date.now();

  meteringInterval = setInterval(async () => {
    if (!recording || recording !== rec) {
      clearMeteringInterval();
      return;
    }

    try {
      const status = await recording.getStatusAsync();
      if (!status.isRecording) return;

      const db = status.metering ?? -160;

      if (db > SILENCE_THRESHOLD_DB) {
        // Speech detected
        silenceStartTime = 0;
        if (!speechDetected) {
          speechDetected = true;
          speechStartTime = Date.now();
          callbacks.onSpeechStart();
        }
      } else if (speechDetected) {
        // Silence after speech
        const speechDuration = Date.now() - speechStartTime;
        if (speechDuration >= MIN_SPEECH_DURATION_MS) {
          if (silenceStartTime === 0) {
            silenceStartTime = Date.now();
          } else if (Date.now() - silenceStartTime >= SILENCE_DURATION_MS) {
            clearMeteringInterval();
            callbacks.onSilenceDetected();
            return;
          }
        }
      }

      // Max duration hard cap
      if (Date.now() - recordingStartTime >= RECORDING_MAX_DURATION_MS) {
        clearMeteringInterval();
        if (speechDetected) {
          callbacks.onMaxDurationReached();
        }
        return;
      }
    } catch {
      // Recording may have been stopped externally
    }
  }, METERING_POLL_INTERVAL_MS);
}

function clearMeteringInterval() {
  if (meteringInterval) {
    clearInterval(meteringInterval);
    meteringInterval = null;
  }
}

export async function stopRecording(): Promise<string | null> {
  clearMeteringInterval();

  if (!recording) return null;

  try {
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    const uri = recording.getURI();
    recording = null;
    return uri;
  } catch {
    recording = null;
    return null;
  }
}

export async function cancelRecording(): Promise<void> {
  clearMeteringInterval();

  if (!recording) return;

  try {
    const uri = recording.getURI();
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    recording = null;
    // Delete the temp file
    if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    recording = null;
  }
}

export async function playAudio(url: string): Promise<Audio.Sound> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: url },
    { shouldPlay: true }
  );

  return sound;
}

export async function getRecordingDuration(): Promise<number> {
  if (!recording) return 0;
  const status = await recording.getStatusAsync();
  return status.isRecording ? status.durationMillis / 1000 : 0;
}

export function isRecording(): boolean {
  return recording !== null;
}
