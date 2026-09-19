// audio-oscilloscope —— 真实音档驱动的示波器（2026-09，参考 remotion.dev「audio/oscilloscope」的动效，程式为本卡自写）。
// 一条金色平滑波形随音档实际振幅起伏（Remotion 官方 @remotion/media-utils 取样，不是假的说话动画）；
// 身后叠 3 层前几帧的残影，像示波器荧光的余辉；中线、稀疏刻度、「● 原音重現」标签、时间码与进度条组成一块深色面板。
// 用途：口播片里「这是那段录音 / 通话 / 原音」的证据镜——观众看得出声音真的在响。
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { createSmoothSvgPath, getWaveformPortion, useWindowedAudioData } from '@remotion/media-utils';

export const AUDIO_OSCILLOSCOPE_DURATION = 216; // 7.2s：demo 语音长度

export type AudioOscilloscopeProps = {
  /** public/ 下的音档路径（mp3 / wav）。 */
  src: string;
  /** 播放这段声音（口播片里通常是被引用的原音，true；若声音已在别轨就 false）。 */
  playAudio?: boolean;
  /** 波形的纵向放大倍数。 */
  amplitude?: number;
  /** 画面上显示的时间跨度（秒）。人声约 0.03–0.06 读得出波形；> 0.1 会塞进太多周期、取样失真成规则波纹。 */
  windowInSeconds?: number;
  /** 取样点数（越多越细）。 */
  samples?: number;
  /** 面板左上的标签。 */
  label?: string;
  /** 面板下方的出处（例：「2026/9/12 記者會錄音」）。 */
  caption?: string;
  accent?: string;
};

const GHOSTS = [2, 4, 6]; // 残影取前几帧
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 100)).padStart(2, '0')}`;

export const AudioOscilloscopeShot: React.FC<AudioOscilloscopeProps> = ({
  src, playAudio = true, amplitude = 1.6, windowInSeconds = 0.04, samples = 160, label = '原音重現', caption, accent = '#e0b04b',
}) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const url = staticFile(src);
  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({ src: url, frame, fps, windowInSeconds: 10 });

  // 面板几何（以短边 1080 为准，置中）
  const PW = Math.min(W * 0.86, 1500 * u), PH = 520 * u;
  const px = (W - PW) / 2, py = (H - PH) / 2;
  const plotX = 60 * u, plotW = PW - 120 * u, plotY = 120 * u, plotH = 280 * u;

  const pathAt = (f: number) => {
    if (!audioData) return null;
    const t = f / fps;
    const bars = getWaveformPortion({
      audioData, startTimeInSeconds: Math.max(0, t - windowInSeconds / 2), durationInSeconds: windowInSeconds,
      numberOfSamples: samples, outputRange: 'minus-one-to-one', dataOffsetInSeconds,
      normalize: false, // 不逐段正规化：大声小声如实反映在振幅上（正规化会让安静段也满幅）
    });
    const pts = bars.map((b, i) => ({
      x: plotX + (i / (samples - 1)) * plotW,
      y: plotY + plotH / 2 + Math.max(-1, Math.min(1, b.amplitude * amplitude)) * (plotH / 2) * 0.9,
    }));
    return createSmoothSvgPath({ points: pts });
  };
  const main = pathAt(frame);
  const t = frame / fps;
  const pulse = 0.5 + 0.5 * Math.sin(frame / 6);

  return (
    <AbsoluteFill style={{ background: '#0b0c0f' }}>
      {playAudio ? <Audio src={url} /> : null}
      <div style={{ position: 'absolute', left: px, top: py, width: PW, height: PH, borderRadius: 28 * u, background: 'linear-gradient(170deg, #15171c, #0f1115)', border: `1.5px solid ${accent}44`, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden', fontFamily: '"PingFang TC","Noto Sans TC",Helvetica,sans-serif' }}>
        {/* 标签与时间码 */}
        <div style={{ position: 'absolute', left: 48 * u, top: 40 * u, display: 'flex', alignItems: 'center', gap: 14 * u, color: '#f2f0ea', fontSize: 32 * u, fontWeight: 800 }}>
          <span style={{ width: 16 * u, height: 16 * u, borderRadius: '50%', background: accent, opacity: 0.4 + 0.6 * pulse, boxShadow: `0 0 ${14 * u}px ${accent}` }} />
          {label}
        </div>
        <div style={{ position: 'absolute', right: 48 * u, top: 44 * u, color: 'rgba(242,240,234,0.55)', fontSize: 28 * u, fontVariantNumeric: 'tabular-nums', fontFamily: 'Menlo, monospace' }}>{fmt(t)}</div>
        <svg width={PW} height={PH} style={{ position: 'absolute', inset: 0 }}>
          {/* 中线与稀疏刻度 */}
          <line x1={plotX} y1={plotY + plotH / 2} x2={plotX + plotW} y2={plotY + plotH / 2} stroke="rgba(242,240,234,0.12)" strokeWidth={2 * u} />
          {Array.from({ length: 11 }, (_, i) => (
            <line key={i} x1={plotX + (i / 10) * plotW} y1={plotY + plotH / 2 - 8 * u} x2={plotX + (i / 10) * plotW} y2={plotY + plotH / 2 + 8 * u} stroke="rgba(242,240,234,0.12)" strokeWidth={2 * u} />
          ))}
          {/* 余辉：前几帧的波形，越旧越淡 */}
          {GHOSTS.map((g, k) => {
            const d = pathAt(frame - g);
            return d ? <path key={g} d={d} fill="none" stroke={accent} strokeWidth={4 * u} opacity={0.22 - k * 0.06} strokeLinecap="round" /> : null;
          })}
          {main ? (
            <>
              <path d={main} fill="none" stroke={accent} strokeWidth={14 * u} opacity={0.25} strokeLinecap="round" style={{ filter: `blur(${8 * u}px)` }} />
              <path d={main} fill="none" stroke={accent} strokeWidth={5 * u} strokeLinecap="round" />
            </>
          ) : null}
        </svg>
        {/* 进度条 */}
        <div style={{ position: 'absolute', left: plotX, right: plotX, bottom: 48 * u, height: 4 * u, borderRadius: 2 * u, background: 'rgba(242,240,234,0.12)' }}>
          <div style={{ width: `${Math.min(1, frame / Math.max(1, durationInFrames - 1)) * 100}%`, height: '100%', borderRadius: 2 * u, background: accent }} />
        </div>
      </div>
      {caption ? <div style={{ position: 'absolute', left: 0, right: 0, top: py + PH + 36 * u, textAlign: 'center', color: 'rgba(242,240,234,0.6)', fontFamily: '"PingFang TC","Noto Sans TC",sans-serif', fontSize: 30 * u }}>{caption}</div> : null}
    </AbsoluteFill>
  );
};

// demo：7.2 秒示范语音（MiniMax 合成的中性句子，存于 demos/_textures/voice-demo.mp3，需复制到 public/textures/live/）
export const AudioOscilloscope: React.FC = () => (
  <AudioOscilloscopeShot src="textures/live/voice-demo.mp3" caption="示範錄音（合成語音）" />
);
