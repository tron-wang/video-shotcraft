// 口播镜头的相机：每镜一条极缓缩放曲线，段内画面的「活」只来自它。
// 不摇晃、不旋转、不模糊；幅度 1.00 → 1.04 量级（或反向拉远）。
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

export const SlowPush: React.FC<{
  /** 本镜长度（帧）。缩放在整镜内线性走完——线性才读作「相机在动」，缓动反而像 UI 动画。 */
  duration: number;
  from?: number;
  to?: number;
  /** 缩放原点（百分比）。对准画面主体，主体才不会被推出安全区。 */
  origin?: [number, number];
  children: React.ReactNode;
}> = ({ duration, from = 1, to = 1.04, origin = [50, 45], children }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, Math.max(1, duration - 1)], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${scale})`,
        transformOrigin: `${origin[0]}% ${origin[1]}%`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
};
