import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { RECORDING_MAX_DURATION_MS } from '@/config/constants';

let recording: Audio.Recording | null = null;

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

export async function startRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording: rec } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  recording = rec;

  // Auto-stop after max duration
  setTimeout(async () => {
    if (recording === rec) {
      await stopRecording();
    }
  }, RECORDING_MAX_DURATION_MS);
}

export async function stopRecording(): Promise<string | null> {
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
