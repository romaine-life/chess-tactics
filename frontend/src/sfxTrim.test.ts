import { describe, expect, it } from 'vitest';
import {
  encodePcm16Wav,
  pcmDurationMs,
  pcmWaveformPeaks,
  resolvePcmTrim,
  type PcmAudio,
} from './sfxTrim';

const audio = (): PcmAudio => ({
  sampleRate: 1000,
  channels: [new Float32Array([-1, -0.5, 0, 0.5, 1])],
});

describe('SFX trim', () => {
  it('resolves millisecond edits to exact bounded PCM frames', () => {
    expect(pcmDurationMs(audio())).toBe(5);
    expect(resolvePcmTrim(audio(), 1, 4)).toEqual({
      startFrame: 1,
      endFrame: 4,
      startMs: 1,
      endMs: 4,
      durationMs: 3,
    });
    expect(resolvePcmTrim(audio(), -20, 99)).toMatchObject({ startFrame: 0, endFrame: 5 });
  });

  it('encodes only the selected frames as deterministic PCM16 WAV', () => {
    const { bytes, range } = encodePcm16Wav(audio(), 1, 4);
    const view = new DataView(bytes.buffer);

    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(1000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(bytes.byteLength).toBe(50);
    expect(view.getInt16(44, true)).toBe(-16384);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(16384);
    expect(range.durationMs).toBe(3);
  });

  it('builds a channel-combined amplitude envelope for the editor', () => {
    expect(pcmWaveformPeaks(audio(), 5)).toEqual([1, 0.5, 0, 0.5, 1]);
  });
});
