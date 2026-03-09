import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import {
  RECORDING_MAX_DURATION_MS,
  SILENCE_THRESHOLD_DB,
  SILENCE_DURATION_MS,
  METERING_POLL_INTERVAL_MS,
  MIN_SPEECH_DURATION_MS,
} from '@/config/constants';

// Record in WAV format — natively supported by gpt-4o-audio-preview (no server-side conversion)
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
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
    RECORDING_OPTIONS
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

// ─── Base64 Audio Playback & Queue ──────────────────────────

let audioChunkCounter = 0;

export async function playAudioFromBase64(
  base64: string,
  format: 'mp3' | 'wav' = 'mp3'
): Promise<Audio.Sound> {
  const fileUri = `${FileSystem.cacheDirectory}call-audio-${audioChunkCounter++}.${format}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: fileUri },
    { shouldPlay: true }
  );

  return sound;
}

export async function setPlaybackMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
  });
}

export interface AudioQueueItem {
  base64: string;
  index: number;
  text: string;
  format?: 'mp3' | 'wav';
}

export class AudioQueue {
  private queue: AudioQueueItem[] = [];
  private playing = false;
  private complete = false;
  private currentSound: Audio.Sound | null = null;
  private preloadedSound: Audio.Sound | null = null;
  private preloadedIndex: number | null = null;
  private onChunkStart?: (text: string, index: number) => void;
  private onAllFinished?: () => void;

  constructor(
    onChunkStart?: (text: string, index: number) => void,
    onAllFinished?: () => void
  ) {
    this.onChunkStart = onChunkStart;
    this.onAllFinished = onAllFinished;
  }

  /** Signal that no more chunks will arrive. onAllFinished fires once playback drains. */
  markComplete() {
    this.complete = true;
    // If already drained while waiting, fire now
    if (!this.playing && this.queue.length === 0) {
      this.onAllFinished?.();
    }
  }

  enqueue(item: AudioQueueItem) {
    this.queue.push(item);
    // Sort by index to handle out-of-order arrivals
    this.queue.sort((a, b) => a.index - b.index);
    if (!this.playing) {
      this.playNext();
    } else {
      // Pre-load next chunk while current one plays
      this.tryPreload();
    }
  }

  private async tryPreload() {
    if (this.preloadedSound || this.queue.length === 0) return;
    const next = this.queue[0];
    if (!next) return;
    try {
      const fileUri = `${FileSystem.cacheDirectory}call-audio-${audioChunkCounter++}.${next.format ?? 'mp3'}`;
      await FileSystem.writeAsStringAsync(fileUri, next.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: false }
      );
      this.preloadedSound = sound;
      this.preloadedIndex = next.index;
    } catch {
      // Pre-load failed — will load normally in playNext
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.playing = false;
      if (this.complete) {
        this.onAllFinished?.();
      }
      return;
    }

    this.playing = true;
    const item = this.queue.shift()!;
    this.onChunkStart?.(item.text, item.index);

    try {
      // Use preloaded sound if it matches
      if (this.preloadedSound && this.preloadedIndex === item.index) {
        this.currentSound = this.preloadedSound;
        this.preloadedSound = null;
        this.preloadedIndex = null;
        await this.currentSound.playAsync();
      } else {
        // Discard stale preload
        if (this.preloadedSound) {
          this.preloadedSound.unloadAsync().catch(() => {});
          this.preloadedSound = null;
          this.preloadedIndex = null;
        }
        this.currentSound = await playAudioFromBase64(item.base64, item.format ?? 'mp3');
      }

      // Start pre-loading the next chunk immediately
      this.tryPreload();

      // Safety timeout — if didJustFinish never fires, move on after 30s
      let finished = false;
      const timeout = setTimeout(() => {
        if (!finished) {
          console.warn('Audio chunk timed out, moving to next');
          finished = true;
          this.currentSound?.unloadAsync().catch(() => {});
          this.currentSound = null;
          this.playNext();
        }
      }, 30000);

      this.currentSound.setOnPlaybackStatusUpdate((status) => {
        if (finished) return;
        if ('didJustFinish' in status && status.didJustFinish) {
          finished = true;
          clearTimeout(timeout);
          this.currentSound?.unloadAsync().catch(() => {});
          this.currentSound = null;
          this.playNext();
        }
        // Also handle error status
        if ('error' in status && status.error) {
          console.error('Playback error:', status.error);
          finished = true;
          clearTimeout(timeout);
          this.currentSound?.unloadAsync().catch(() => {});
          this.currentSound = null;
          this.playNext();
        }
      });
    } catch (err) {
      console.error('Audio chunk playback failed:', err);
      this.currentSound = null;
      this.playNext();
    }
  }

  async stop() {
    this.queue = [];
    if (this.currentSound) {
      try {
        await this.currentSound.stopAsync();
        await this.currentSound.unloadAsync();
      } catch {
        // Already unloaded
      }
      this.currentSound = null;
    }
    if (this.preloadedSound) {
      this.preloadedSound.unloadAsync().catch(() => {});
      this.preloadedSound = null;
      this.preloadedIndex = null;
    }
    this.playing = false;
  }

  isPlaying(): boolean {
    return this.playing;
  }
}

// Clean up old audio chunk temp files
export async function cleanupAudioChunks(): Promise<void> {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return;
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    const chunkFiles = files.filter((f) => f.startsWith('call-audio-'));
    await Promise.all(
      chunkFiles.map((f) =>
        FileSystem.deleteAsync(`${cacheDir}${f}`, { idempotent: true })
      )
    );
  } catch {
    // Best effort cleanup
  }
  audioChunkCounter = 0;
}

export async function getRecordingDuration(): Promise<number> {
  if (!recording) return 0;
  const status = await recording.getStatusAsync();
  return status.isRecording ? status.durationMillis / 1000 : 0;
}

export function isRecording(): boolean {
  return recording !== null;
}
