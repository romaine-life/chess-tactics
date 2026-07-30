export interface PcmAudio {
  sampleRate: number;
  channels: readonly Float32Array[];
}

export interface PcmTrimRange {
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

function assertPcm(audio: PcmAudio): number {
  if (!Number.isSafeInteger(audio.sampleRate) || audio.sampleRate < 1) {
    throw new Error('PCM audio requires a positive integer sample rate');
  }
  if (!audio.channels.length) throw new Error('PCM audio requires at least one channel');
  const frameCount = Math.min(...audio.channels.map((channel) => channel.length));
  if (frameCount < 1) throw new Error('PCM audio requires at least one frame');
  return frameCount;
}

export function pcmFromAudioBuffer(
  buffer: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'getChannelData'>,
): PcmAudio {
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, index) => buffer.getChannelData(index),
  );
  const audio = { sampleRate: buffer.sampleRate, channels };
  assertPcm(audio);
  return audio;
}

export function pcmDurationMs(audio: PcmAudio): number {
  return Math.round((assertPcm(audio) / audio.sampleRate) * 1000);
}

export function resolvePcmTrim(audio: PcmAudio, startMs: number, endMs: number): PcmTrimRange {
  const frameCount = assertPcm(audio);
  const safeStartMs = Number.isFinite(startMs) ? startMs : 0;
  const safeEndMs = Number.isFinite(endMs) ? endMs : pcmDurationMs(audio);
  const startFrame = Math.max(0, Math.min(frameCount - 1, Math.round((safeStartMs / 1000) * audio.sampleRate)));
  const requestedEndFrame = Math.round((safeEndMs / 1000) * audio.sampleRate);
  const endFrame = Math.max(startFrame + 1, Math.min(frameCount, requestedEndFrame));
  const resolvedStartMs = (startFrame / audio.sampleRate) * 1000;
  const resolvedEndMs = (endFrame / audio.sampleRate) * 1000;
  return {
    startFrame,
    endFrame,
    startMs: resolvedStartMs,
    endMs: resolvedEndMs,
    durationMs: Math.round(resolvedEndMs - resolvedStartMs),
  };
}

export function pcmWaveformPeaks(audio: PcmAudio, bars: number): number[] {
  const frameCount = assertPcm(audio);
  const count = Math.max(1, Math.min(frameCount, Math.floor(bars)));
  return Array.from({ length: count }, (_, index) => {
    const from = Math.floor((index * frameCount) / count);
    const to = Math.max(from + 1, Math.floor(((index + 1) * frameCount) / count));
    let peak = 0;
    for (const channel of audio.channels) {
      for (let frame = from; frame < to; frame += 1) {
        peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
      }
    }
    return Math.min(1, peak);
  });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function pcm16Sample(value: number): number {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
  return Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767);
}

export function encodePcm16Wav(
  audio: PcmAudio,
  startMs = 0,
  endMs = pcmDurationMs(audio),
): { bytes: Uint8Array; range: PcmTrimRange } {
  const range = resolvePcmTrim(audio, startMs, endMs);
  const channelCount = audio.channels.length;
  const bytesPerSample = 2;
  const frameCount = range.endFrame - range.startFrame;
  const dataBytes = frameCount * channelCount * bytesPerSample;
  const output = new Uint8Array(44 + dataBytes);
  const view = new DataView(output.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = range.startFrame; frame < range.endFrame; frame += 1) {
    for (const channel of audio.channels) {
      view.setInt16(offset, pcm16Sample(channel[frame] ?? 0), true);
      offset += bytesPerSample;
    }
  }
  return { bytes: output, range };
}
