import React, { useMemo } from 'react';

interface RiffstickGuitarProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
}

const MECHANICAL_FRETS = [
  { code: 'BTN_SOUTH', label: 'GRN', fill: '#2ecc71', colorCode: '#27ae60', switchType: 'Cherry Green' },
  { code: 'BTN_EAST', label: 'RED', fill: '#e74c3c', colorCode: '#c0392b', switchType: 'Cherry Red' },
  { code: 'BTN_NORTH', label: 'YEL', fill: '#f1c40f', colorCode: '#f39c12', switchType: 'Cherry Yellow' },
  { code: 'BTN_WEST', label: 'BLU', fill: '#3498db', colorCode: '#2980b9', switchType: 'Cherry Blue' },
  { code: 'BTN_TL', label: 'ORG', fill: '#e67e22', colorCode: '#d35400', switchType: 'Cherry Orange' },
];

const SOLO_FRETS = [
  { code: 'SOLO_GREEN', fill: '#2ecc71' },
  { code: 'SOLO_RED', fill: '#e74c3c' },
  { code: 'SOLO_YELLOW', fill: '#f1c40f' },
  { code: 'SOLO_BLUE', fill: '#3498db' },
  { code: 'SOLO_ORANGE', fill: '#e67e22' },
];

const ACCENT = '#e94560';

export const RiffstickGuitar: React.FC<RiffstickGuitarProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
}) => {
  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const isSelected = (code: string) => selectedInput === code;

  const whammyValue = activeInputs.get('ABS_RZ') ?? activeInputs.get('WHAMMY') ?? 0;
  const tiltValue = activeInputs.get('ABS_Y') ?? activeInputs.get('TILT') ?? 0;

  const svgStyle = useMemo(
    () => ({ width: 420 * scale, height: 720 * scale }),
    [scale],
  );

  return (
    <svg
      viewBox="0 0 420 720"
      style={{ ...svgStyle, display: 'block', margin: '0 auto' }}
      className="hardware-diagram riffstick-guitar"
    >
      <defs>
        {/* Carbon / 3D-print layered texture */}
        <pattern id="printLayers" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="2" x2="4" y2="2" stroke="#252538" strokeWidth="1" opacity="0.6" />
        </pattern>

        <linearGradient id="chassisGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1e2d" />
          <stop offset="50%" stopColor="#151522" />
          <stop offset="100%" stopColor="#0d0d17" />
        </linearGradient>

        <linearGradient id="neckGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2c2c3e" />
          <stop offset="50%" stopColor="#3a3a52" />
          <stop offset="100%" stopColor="#242436" />
        </linearGradient>

        <radialGradient id="strumGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.8" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </radialGradient>

        <filter id="switchShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.7" />
        </filter>
      </defs>

      {/* ── Headstock & RP2040 Microcontroller badge ── */}
      <path
        d="M 160 20 L 260 20 L 250 80 L 170 80 Z"
        fill="url(#chassisGrad)"
        stroke="#444"
        strokeWidth="2"
      />
      <rect x="180" y="30" width="60" height="25" rx="4" fill="#008080" stroke="#00ffff" strokeWidth="1" />
      <text x="210" y="47" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="monospace">
        RP2040
      </text>

      {/* ── 3D-Printed Guitar Neck ── */}
      <rect x="165" y="80" width="90" height="320" rx="4" fill="url(#neckGrad)" stroke="#444" strokeWidth="2" />
      <rect x="165" y="80" width="90" height="320" fill="url(#printLayers)" />

      {/* Fret division lines */}
      {[135, 195, 255, 315, 375].map((y, idx) => (
        <line key={idx} x1="165" y1={y} x2="255" y2={y} stroke="#666" strokeWidth="2" />
      ))}

      {/* ── Mechanical Key Frets (Cherry MX Switches) ── */}
      {MECHANICAL_FRETS.map((fret, i) => {
        const y = 90 + i * 58;
        const active = isActive(fret.code);
        const sel = isSelected(fret.code);

        return (
          <g
            key={fret.code}
            data-input-code={fret.code}
            onClick={() => onSelectInput(fret.code)}
            style={{ cursor: 'pointer' }}
          >
            {/* Switch housing */}
            <rect
              x="175"
              y={y}
              width="70"
              height="44"
              rx="6"
              fill={active ? fret.fill : '#181824'}
              stroke={sel ? ACCENT : active ? '#fff' : fret.colorCode}
              strokeWidth={sel ? 3 : 2}
              filter="url(#switchShadow)"
            />
            {/* Keycap insert */}
            <rect
              x="183"
              y={y + 6}
              width="54"
              height="30"
              rx="4"
              fill={active ? '#ffffff' : fret.colorCode}
              opacity={active ? 0.9 : 0.8}
            />
            <text
              x="210"
              y={y + 26}
              textAnchor="middle"
              fill={active ? '#000' : '#fff'}
              fontSize="12"
              fontWeight="900"
              fontFamily="monospace"
            >
              {fret.label}
            </text>
          </g>
        );
      })}

      {/* ── Solo Frets (Low Profile) ── */}
      {SOLO_FRETS.map((fret, i) => {
        const y = 370;
        const x = 173 + i * 15;
        const active = isActive(fret.code);
        const sel = isSelected(fret.code);
        return (
          <rect
            key={fret.code}
            data-input-code={fret.code}
            onClick={() => onSelectInput(fret.code)}
            x={x}
            y={y}
            width="12"
            height="22"
            rx="3"
            fill={active ? fret.fill : '#222'}
            stroke={sel ? ACCENT : active ? '#fff' : fret.fill}
            strokeWidth={sel ? 2 : 1}
            style={{ cursor: 'pointer' }}
          />
        );
      })}

      {/* ── Compact 3D-Printed Body Chassis ── */}
      <path
        d="M 120 400
           C 60 420, 40 500, 70 580
           C 90 640, 160 690, 210 690
           C 260 690, 330 640, 350 580
           C 380 500, 360 420, 300 400
           Z"
        fill="url(#chassisGrad)"
        stroke="#444"
        strokeWidth="3"
      />
      {/* 3D print texture overlay */}
      <path
        d="M 120 400
           C 60 420, 40 500, 70 580
           C 90 640, 160 690, 210 690
           C 260 690, 330 640, 350 580
           C 380 500, 360 420, 300 400
           Z"
        fill="url(#printLayers)"
      />

      {/* GP2040-CE / Riffstick Emblem */}
      <text x="210" y="440" textAnchor="middle" fill="#8888aa" fontSize="11" fontWeight="bold" letterSpacing="2">
        GP2040-CE RIFFSTICK
      </text>

      {/* ── Mechanical Strum Bar (Dual Cherry MX Click) ── */}
      <g
        data-input-code="STRUM"
        onClick={() => onSelectInput('BTN_DPAD_UP')}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x="195"
          y="460"
          width="30"
          height="120"
          rx="8"
          fill={isActive('BTN_DPAD_UP') || isActive('BTN_DPAD_DOWN') ? ACCENT : '#2a2a3e'}
          stroke={isSelected('BTN_DPAD_UP') || isSelected('BTN_DPAD_DOWN') ? '#fff' : '#555'}
          strokeWidth="2"
          filter="url(#switchShadow)"
        />
        {/* Strum Up Switch Indicator */}
        <path
          d="M 210 475 L 203 490 L 217 490 Z"
          fill={isActive('BTN_DPAD_UP') ? '#fff' : '#666'}
        />
        {/* Strum Down Switch Indicator */}
        <path
          d="M 210 565 L 203 550 L 217 550 Z"
          fill={isActive('BTN_DPAD_DOWN') ? '#fff' : '#666'}
        />
      </g>

      {/* ── Whammy Rotary Potentiometer / Lever ── */}
      <g
        data-input-code="ABS_RZ"
        onClick={() => onSelectInput('ABS_RZ')}
        style={{ cursor: 'pointer' }}
      >
        {/* Rotary gauge dial */}
        <circle cx="280" cy="540" r="28" fill="#181824" stroke="#555" strokeWidth="2" />
        <circle cx="280" cy="540" r="22" fill="#252538" />
        {/* Whammy Needle */}
        <line
          x1="280"
          y1="540"
          x2={280 + Math.cos((whammyValue * 180 - 90) * (Math.PI / 180)) * 20}
          y2={540 + Math.sin((whammyValue * 180 - 90) * (Math.PI / 180)) * 20}
          stroke={isSelected('ABS_RZ') ? ACCENT : '#00e5ff'}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text x="280" y="582" textAnchor="middle" fill="#aaa" fontSize="9" fontWeight="bold">
          WHAMMY
        </text>
      </g>

      {/* ── Tilt / Star Power Sensor ── */}
      <g
        data-input-code="ABS_Y"
        onClick={() => onSelectInput('ABS_Y')}
        style={{ cursor: 'pointer' }}
      >
        <rect x="130" y="525" width="22" height="45" rx="5" fill="#181824" stroke="#555" strokeWidth="2" />
        {/* Mercury / Accelerometer level */}
        <rect
          x="133"
          y={565 - Math.max(5, Math.min(38, tiltValue * 38))}
          width="16"
          height={Math.max(5, Math.min(38, tiltValue * 38))}
          rx="3"
          fill={tiltValue > 0.5 ? '#f1c40f' : '#3498db'}
        />
        <text x="141" y="582" textAnchor="middle" fill="#aaa" fontSize="9" fontWeight="bold">
          TILT
        </text>
      </g>

      {/* ── Aux / Menu Panel (Start, Select, Guide) ── */}
      <g>
        {/* Select Button */}
        <circle
          cx="170"
          cy="620"
          r="12"
          data-input-code="BTN_SELECT"
          onClick={() => onSelectInput('BTN_SELECT')}
          fill={isActive('BTN_SELECT') ? ACCENT : '#2a2a3e'}
          stroke={isSelected('BTN_SELECT') ? '#fff' : '#666'}
          strokeWidth="2"
          style={{ cursor: 'pointer' }}
        />
        <text x="170" y="624" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">SEL</text>

        {/* Start Button */}
        <circle
          cx="250"
          cy="620"
          r="12"
          data-input-code="BTN_START"
          onClick={() => onSelectInput('BTN_START')}
          fill={isActive('BTN_START') ? ACCENT : '#2a2a3e'}
          stroke={isSelected('BTN_START') ? '#fff' : '#666'}
          strokeWidth="2"
          style={{ cursor: 'pointer' }}
        />
        <text x="250" y="624" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">START</text>

        {/* Home / Mode Button */}
        <circle
          cx="210"
          cy="640"
          r="14"
          data-input-code="BTN_MODE"
          onClick={() => onSelectInput('BTN_MODE')}
          fill={isActive('BTN_MODE') ? ACCENT : '#2a2a3e'}
          stroke={isSelected('BTN_MODE') ? '#fff' : '#666'}
          strokeWidth="2"
          style={{ cursor: 'pointer' }}
        />
        <text x="210" y="644" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">GUIDE</text>
      </g>
    </svg>
  );
};

export default RiffstickGuitar;
