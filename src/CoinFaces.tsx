import React from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Path,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';

// One shared visual language for both faces: a rich gold disc with a reeded
// rim, a beaded inner border, and an embossed emblem — sun for heads,
// crescent moon for tails.

const SIZE = 300;
const C = SIZE / 2;

function beads(radius: number, count: number, r: number, fill: string) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    dots.push(
      <Circle
        key={i}
        cx={C + Math.cos(a) * radius}
        cy={C + Math.sin(a) * radius}
        r={r}
        fill={fill}
      />,
    );
  }
  return dots;
}

function reeding(rOuter: number, rInner: number, count: number, stroke: string) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    lines.push(
      <Path
        key={i}
        d={`M ${C + Math.cos(a) * rInner} ${C + Math.sin(a) * rInner} L ${
          C + Math.cos(a) * rOuter
        } ${C + Math.sin(a) * rOuter}`}
        stroke={stroke}
        strokeWidth={2}
      />,
    );
  }
  return lines;
}

function Disc({ children }: { children: React.ReactNode }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Defs>
        <RadialGradient id="face" cx="38%" cy="30%" r="85%">
          <Stop offset="0%" stopColor="#FCEFB8" />
          <Stop offset="45%" stopColor="#EFC75E" />
          <Stop offset="78%" stopColor="#D9A537" />
          <Stop offset="100%" stopColor="#9C7118" />
        </RadialGradient>
        <RadialGradient id="rim" cx="38%" cy="30%" r="90%">
          <Stop offset="0%" stopColor="#F3D678" />
          <Stop offset="70%" stopColor="#C6913A" />
          <Stop offset="100%" stopColor="#7A5510" />
        </RadialGradient>
        <LinearGradient id="emblem" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#B98B2A" />
          <Stop offset="100%" stopColor="#8F6414" />
        </LinearGradient>
        {/* same as #face but in user space, so a "bite" circle can blend
            seamlessly into the face behind it (carves the crescent moon) */}
        <RadialGradient
          id="faceUser"
          gradientUnits="userSpaceOnUse"
          cx={14 + 0.38 * (SIZE - 28)}
          cy={14 + 0.3 * (SIZE - 28)}
          r={0.85 * (SIZE - 28)}
        >
          <Stop offset="0%" stopColor="#FCEFB8" />
          <Stop offset="45%" stopColor="#EFC75E" />
          <Stop offset="78%" stopColor="#D9A537" />
          <Stop offset="100%" stopColor="#9C7118" />
        </RadialGradient>
        <ClipPath id="faceClip">
          <Circle cx={C} cy={C} r={C - 14} />
        </ClipPath>
      </Defs>
      {/* rim with reeding */}
      <Circle cx={C} cy={C} r={C - 2} fill="url(#rim)" />
      <G opacity={0.5}>{reeding(C - 3, C - 13, 72, '#6E4D0E')}</G>
      {/* face */}
      <Circle cx={C} cy={C} r={C - 14} fill="url(#face)" />
      <Circle
        cx={C}
        cy={C}
        r={C - 16}
        fill="none"
        stroke="#8F6414"
        strokeWidth={1.5}
        opacity={0.6}
      />
      {/* beaded border */}
      <G opacity={0.75}>{beads(C - 26, 56, 2.6, '#A87A1D')}</G>
      {children}
      {/* soft top-left sheen, clipped to the coin face */}
      <G clipPath="url(#faceClip)">
        <Circle cx={C - 42} cy={C - 52} r={C - 40} fill="rgba(255,255,255,0.10)" opacity={0.5} />
      </G>
    </Svg>
  );
}

// Heads — radiant sun: solid core, alternating long/short rays.
export function HeadsFace() {
  const rays = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const long = i % 2 === 0;
    const rBase = 58;
    const rTip = long ? 96 : 80;
    const spread = 0.085;
    const x1 = C + Math.cos(a - spread) * rBase;
    const y1 = C + Math.sin(a - spread) * rBase;
    const x2 = C + Math.cos(a + spread) * rBase;
    const y2 = C + Math.sin(a + spread) * rBase;
    const xt = C + Math.cos(a) * rTip;
    const yt = C + Math.sin(a) * rTip;
    rays.push(
      <Path key={i} d={`M ${x1} ${y1} L ${xt} ${yt} L ${x2} ${y2} Z`} fill="url(#emblem)" />,
    );
  }
  return (
    <Disc>
      <G>
        {rays}
        <Circle cx={C} cy={C} r={46} fill="url(#emblem)" />
        <Circle cx={C - 12} cy={C - 14} r={40} fill="rgba(255,244,200,0.18)" />
      </G>
    </Disc>
  );
}

// Tails — crescent moon with three small stars.
function star(cx: number, cy: number, r: number, key: number) {
  return (
    <Path
      key={key}
      d={`M ${cx} ${cy - r} Q ${cx + r * 0.22} ${cy - r * 0.22} ${cx + r} ${cy} Q ${
        cx + r * 0.22
      } ${cy + r * 0.22} ${cx} ${cy + r} Q ${cx - r * 0.22} ${cy + r * 0.22} ${cx - r} ${cy} Q ${
        cx - r * 0.22
      } ${cy - r * 0.22} ${cx} ${cy - r} Z`}
      fill="url(#emblem)"
    />
  );
}

export function TailsFace() {
  return (
    <Disc>
      <G>
        {/* full moon, then a face-colored bite carves the crescent */}
        <Circle cx={C} cy={C} r={88} fill="url(#emblem)" />
        <Circle cx={C + 34} cy={C} r={74} fill="url(#faceUser)" />
        {star(C + 44, C - 34, 12, 1)}
        {star(C + 62, C + 6, 8, 2)}
        {star(C + 40, C + 44, 10, 3)}
      </G>
    </Disc>
  );
}
