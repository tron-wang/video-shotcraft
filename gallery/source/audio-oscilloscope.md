---
name: audio-oscilloscope
一句话: 真实音档驱动的示波器——一条金色平滑波形随声音实际振幅起伏、身后叠三层余辉，深色面板上有「● 原音重現」标签、时间码与进度条；大声小声如实反映，停顿时回到中线
适用: 口播片里「这是那段录音 / 通话 / 原音」的证据镜：记者会原音、通话录音、访谈片段、Podcast 引用；也可当纯语音段落的画面
时长: 与音档同长（demo 7.2s）
能量: 低偏中（画面只有波形在动，节奏完全跟着声音）
input: [text]
narration: evidence
---

## 意图
口播片引用一段原音时，画面若只放一张静态图，观众不确定「现在听到的是不是那段录音」。示波器让声音**看得见**：波形跟着真实音档的振幅起伏，讲话时起伏、停顿时回到中线，观众一眼知道「这段声音正在播」。它用的是 Remotion 官方的音频取样（`@remotion/media-utils`），不是假的说话动画（那是 `voice-waveform-live` 的用途：示意录音 UI）。
（2026-09 收入：参考 remotion.dev「audio/oscilloscope」的动效；程式为本卡自写，黑金配色、加余辉与面板。）

## 动效核心
- `useWindowedAudioData` 取音档（每次载入 10s 窗口）；`getWaveformPortion` 以当前时间为中心取 `windowInSeconds`（0.04s）内 `samples`（160）个点，输出 −1…1，**不逐段正规化**（`normalize: false`）——大声小声如实反映；`createSmoothSvgPath` 连成平滑曲线
- 波形 = 5px 金色实线 + 14px 柔光；身后叠前 2 / 4 / 6 帧的波形（透明度 0.22 / 0.16 / 0.10）当余辉
- 面板：圆角 28、淡金描边；左上「●」标签（圆点呼吸闪烁）、右上 mm:ss.cc 时间码、中线 + 11 个刻度、下方进度条（整镜长度）
- `playAudio` 为 true 时同时播放这段声音
- 以短边 1080 为准等比，横式直式都能用

## 参数表
| 参数 | 典型值 | 调节手感 |
|------|--------|----------|
| `src` | `public/` 下的 mp3 / wav | 口播片引用的原音；人声最好，音乐也可 |
| `windowInSeconds` | 0.04 | 人声 0.03–0.06 读得出波形；> 0.1 塞进太多周期，取样失真成规则波纹（实测踩过） |
| `samples` | 160 | < 100 曲线变粗糙；> 240 太细看不清 |
| `amplitude` | 1.6 | 录音音量小就调高；满幅会被削平成方波 |
| `playAudio` | true | 声音已在别的音轨时关掉，避免重复 |
| `label` / `caption` | 「原音重現」/ 出处 | caption 写录音出处与日期 |
| `accent` | `theme.accent` | 波形、圆点、描边、进度条同色 |

## 已知坑
- **正规化陷阱**：`getWaveformPortion` 预设逐段正规化，安静段也会满幅——一定要 `normalize: false`
- **窗口太长会失真**：人声基频约 100–300Hz，0.35s 窗口里有上百个周期，160 个取样点不够，画出来像规则正弦波（初版踩过）
- **原音与口播叠在一起**：引用原音时口播要停，或把原音压到 −12dB 以下；字幕要标明是原音内容
- **版权与出处**：引用他人录音要确认来源与授权，caption 标出处；demo 的示范语音是 MiniMax 合成的中性句子（`demos/_textures/voice-demo.mp3`）

## 参考实现
demos/interaction/audio-oscilloscope/AudioOscilloscope.tsx（导出 `AudioOscilloscopeShot` / `AudioOscilloscopeProps` / `AUDIO_OSCILLOSCOPE_DURATION`；demo 读 `textures/live/voice-demo.mp3`，需把 `demos/_textures/voice-demo.mp3` 复制到成片工程的 `public/textures/live/`）
