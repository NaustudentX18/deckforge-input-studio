import React, { useMemo } from 'react';
import { fitSvgStyle } from '../../utils/svgFit';

interface CRKDGuitarProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
  connectionMode?: 'bluetooth' | 'usb' | 'wireless_2_4g';
  batteryLevel?: number; // 0 - 100
}

const ACCENT = '#e94560';

const MECHANICAL_FRETS = [
  { code: 'FRET_GREEN', fill: '#2ecc71', label: '1', key: 'G' },
  { code: 'FRET_RED', fill: '#e74c3c', label: '2', key: 'R' },
  { code: 'FRET_YELLOW', fill: '#f1c40f', label: '3', key: 'Y' },
  { code: 'FRET_BLUE', fill: '#3498db', label: '4', key: 'B' },
  { code: 'FRET_ORANGE', fill: '#e67e22', label: '5', key: 'O' },
];

const SOLO_FRETS = [
  { code: 'SOLO_GREEN', fill: '#2ecc71', label: 'S1' },
  { code: 'SOLO_RED', fill: '#e74c3c', label: 'S2' },
  { code: 'SOLO_YELLOW', fill: '#f1c40f', label: 'S3' },
  { code: 'SOLO_BLUE', fill: '#3498db', label: 'S4' },
  { code: 'SOLO_ORANGE', fill: '#e67e22', label: 'S5' },
];

export const CRKDGuitar: React.FC<CRKDGuitarProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
  connectionMode = 'bluetooth',
  batteryLevel = 88,
}) => {
  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const getValue = (code: string) => activeInputs.get(code) ?? 0;
  const isSelected = (code: string) => selectedInput === code;

  const whammyValue = getValue('WHAMMY');
  const tiltValue = getValue('TILT');

  const svgStyle = useMemo(
    () => fitSvgStyle(400, 700, scale),
    [scale],
  );

  const renderHighlightCircle = (cx: number, cy: number, r: number) => (
    <circle
      cx={cx}
      cy={cy}
      r={r + 4}
      fill="none"
      stroke={ACCENT}
      strokeWidth="3"
      strokeDasharray="6 3"
      className="highlight-ring"
    >
      <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.8s" repeatCount="indefinite" />
    </circle>
  );

  const renderHighlightRect = (x: number, y: number, w: number, h: number, rx = 5) => (
    <rect
      x={x - 3}
      y={y - 3}
      width={w + 6}
      height={h + 6}
      rx={rx + 2}
      fill="none"
      stroke={ACCENT}
      strokeWidth="3"
      strokeDasharray="6 3"
      className="highlight-ring"
    >
      <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.8s" repeatCount="indefinite" />
    </rect>
  );

  return (
    <svg
      viewBox="0 0 400 700"
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
      className="deckforge-crkd-guitar"
    >
      <defs>
        <filter id="crkd-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="4.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="crkd-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000000" floodOpacity="0.65" />
        </filter>

        {/* Premium matte stealth gradients */}
        <linearGradient id="crkd-chassis-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c2d3a" />
          <stop offset="50%" stopColor="#1e1f29" />
          <stop offset="100%" stopColor="#15161f" />
        </linearGradient>
        <linearGradient id="crkd-neck-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1c1d27" />
          <stop offset="50%" stopColor="#2a2c3a" />
          <stop offset="100%" stopColor="#1c1d27" />
        </linearGradient>
        <linearGradient id="crkd-switch-stem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff4757" />
          <stop offset="100%" stopColor="#c0392b" />
        </linearGradient>
      </defs>

      {/* Modern CRKD NEO S Angular Guitar Silhouette */}
      <path
        d="M 125,60 
           L 275,60 
           L 275,250 
           L 320,290 
           L 370,340 
           C 390,380 385,460 365,520 
           C 345,580 310,635 250,665 
           C 215,680 185,680 150,665 
           C 90,635 55,580 35,520 
           C 15,460 10,380 30,340 
           L 80,290 
           L 125,250 Z"
        fill="url(#crkd-chassis-grad)"
        stroke="#414457"
        strokeWidth="2.5"
        filter="url(#crkd-shadow)"
      />

      {/* Sleek Chamfer Inset */}
      <path
        d="M 132,255 L 268,255 L 305,290 L 350,335 C 368,375 365,445 348,505 C 330,560 300,610 245,640 C 215,655 185,655 155,640 C 100,610 70,560 52,505 C 35,445 32,375 50,335 L 95,290 Z"
        fill="none"
        stroke="#272936"
        strokeWidth="1.5"
      />

      {/* Headstock & Tuner Bracket */}
      <path
        d="M 125,60 L 115,18 C 112,10 120,4 130,4 L 270,4 C 280,4 288,10 285,18 L 275,60 Z"
        fill="#181922"
        stroke="#393b4c"
        strokeWidth="1.5"
      />
      <text x="200" y="25" textAnchor="middle" fill="#757991" fontSize="9" fontWeight="bold" letterSpacing="4">
        CRKD NEO S
      </text>

      {/* Hardware Status Strip: Bluetooth/USB + Battery Indicator */}
      <g id="status-panel" transform="translate(140, 36)">
        {/* Status plate */}
        <rect x="0" y="0" width="120" height="18" rx="4" fill="#12131a" stroke="#2c2e3c" strokeWidth="1" />

        {/* Connection LED */}
        <circle
          cx="14"
          cy="9"
          r="4"
          fill={connectionMode === 'bluetooth' ? '#3498db' : connectionMode === 'usb' ? '#2ecc71' : '#f1c40f'}
          filter="url(#crkd-glow)"
        />
        <text x="23" y="12" fill="#a1a5b7" fontSize="7" fontWeight="bold">
          {connectionMode.toUpperCase()}
        </text>

        {/* Battery Icon & Bar */}
        <g transform="translate(76, 5)">
          <rect x="0" y="0" width="22" height="9" rx="2" fill="none" stroke="#686d84" strokeWidth="1" />
          <rect x="22" y="2.5" width="2" height="4" fill="#686d84" />
          <rect
            x="2"
            y="2"
            width={Math.max(2, 18 * (batteryLevel / 100))}
            height="5"
            rx="1"
            fill={batteryLevel > 20 ? '#2ecc71' : '#e74c3c'}
          />
          <text x="30" y="7.5" fill="#a1a5b7" fontSize="6.5" fontWeight="bold">
            {batteryLevel}%
          </text>
        </g>
      </g>

      {/* Fretboard Neck */}
      <rect x="135" y="60" width="130" height="190" fill="url(#crkd-neck-grad)" stroke="#2b2d3c" strokeWidth="1.5" />

      {/* Neck Center Guideline */}
      <line x1="200" y1="60" x2="200" y2="250" stroke="#333649" strokeWidth="1" strokeDasharray="3 3" />

      {/* 5 Mechanical Cherry MX Switch Fret Buttons */}
      <g id="cherry-mechanical-frets">
        {MECHANICAL_FRETS.map((fret, i) => {
          const w = 22;
          const h = 30;
          const x = 140 + i * 24;
          const y = 80;
          const active = isActive(fret.code);
          const selected = isSelected(fret.code);

          return (
            <g
              key={fret.code}
              data-input-code={fret.code}
              onClick={() => onSelectInput(fret.code)}
              style={{ cursor: 'pointer' }}
            >
              {selected && renderHighlightRect(x, y, w, h, 4)}

              {/* Cherry Switch Outer Housing Frame */}
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx="4"
                fill="#161720"
                stroke="#3e4155"
                strokeWidth="1.5"
              />

              {/* Mechanical Switch Translucent Base */}
              <rect
                x={x + 2}
                y={y + 2}
                width={w - 4}
                height={h - 4}
                rx="3"
                fill={active ? ACCENT : '#242634'}
              />

              {/* Cherry MX Cross Stem Representation */}
              <rect x={x + w / 2 - 2} y={y + 5} width="4" height="12" rx="1" fill={fret.fill} opacity={active ? 1 : 0.8} />
              <rect x={x + 4} y={y + 9} width={w - 8} height="4" rx="1" fill={fret.fill} opacity={active ? 1 : 0.8} />

              {/* Keycap Plunger */}
              <rect
                x={x + 3}
                y={y + (active ? 4 : 2)}
                width={w - 6}
                height={h - 6}
                rx="2"
                fill={active ? ACCENT : fret.fill}
                stroke="#ffffff"
                strokeWidth={active ? 1.5 : 0.5}
                filter={active ? 'url(#crkd-glow)' : undefined}
                opacity={active ? 1 : 0.85}
              />

              {/* Label */}
              <text
                x={x + w / 2}
                y={y + h - 6}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8"
                fontWeight="bold"
                pointerEvents="none"
              >
                {fret.key}
              </text>
            </g>
          );
        })}
      </g>

      {/* Solo Fret Row (Low Profile Mechanical) */}
      <g id="solo-frets-row">
        <text x="200" y="145" textAnchor="middle" fill="#686d84" fontSize="7" fontWeight="bold" letterSpacing="1">
          SOLO MECHANICAL FRETS
        </text>
        {SOLO_FRETS.map((fret, i) => {
          const w = 18;
          const h = 22;
          const x = 145 + i * 22;
          const y = 155;
          const active = isActive(fret.code);
          const selected = isSelected(fret.code);

          return (
            <g
              key={fret.code}
              data-input-code={fret.code}
              onClick={() => onSelectInput(fret.code)}
              style={{ cursor: 'pointer' }}
            >
              {selected && renderHighlightRect(x, y, w, h, 3)}
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx="3"
                fill="#161720"
                stroke="#383a4c"
                strokeWidth="1"
              />
              <rect
                x={x + 2}
                y={y + (active ? 3 : 2)}
                width={w - 4}
                height={h - 4}
                rx="2"
                fill={active ? ACCENT : fret.fill}
                stroke={active ? '#fff' : 'none'}
                strokeWidth="1"
                opacity={active ? 1 : 0.7}
                filter={active ? 'url(#crkd-glow)' : undefined}
              />
              <text
                x={x + w / 2}
                y={y + h / 2 + 3}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="7"
                fontWeight="bold"
                pointerEvents="none"
              >
                {fret.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* Clicky Strum Bar with Spring-Return Visual */}
      <g id="crkd-strum-assembly" transform="translate(145, 330)">
        {/* Housing Well */}
        <rect x="0" y="0" width="110" height="90" rx="8" fill="#15161f" stroke="#333649" strokeWidth="1.5" />

        {/* Dual Spring Return Indicators */}
        {/* Top Spring */}
        <path
          d="M 12 18 Q 18 12 24 18 T 36 18 T 48 18"
          fill="none"
          stroke={isActive('STRUM_UP') ? ACCENT : '#585c74'}
          strokeWidth="2"
        />
        {/* Bottom Spring */}
        <path
          d="M 12 72 Q 18 66 24 72 T 36 72 T 48 72"
          fill="none"
          stroke={isActive('STRUM_DOWN') ? ACCENT : '#585c74'}
          strokeWidth="2"
        />

        {/* Strum Up Switch */}
        <g
          data-input-code="STRUM_UP"
          onClick={() => onSelectInput('STRUM_UP')}
          style={{ cursor: 'pointer' }}
        >
          {isSelected('STRUM_UP') && renderHighlightRect(18, 12, 74, 30, 4)}
          <rect
            x="18"
            y="12"
            width="74"
            height="30"
            rx="4"
            fill={isActive('STRUM_UP') ? ACCENT : '#2b2d3d'}
            stroke="#45495e"
            strokeWidth="1.5"
            filter={isActive('STRUM_UP') ? 'url(#crkd-glow)' : undefined}
          />
          <polygon points="55,18 45,34 65,34" fill="#ffffff" />
          <text x="75" y="30" fill="#ffffff" fontSize="8" fontWeight="bold">UP</text>
        </g>

        {/* Central Pivot Axle */}
        <line x1="10" y1="45" x2="100" y2="45" stroke="#101117" strokeWidth="3" />
        <circle cx="55" cy="45" r="4" fill="#4d5066" />

        {/* Strum Down Switch */}
        <g
          data-input-code="STRUM_DOWN"
          onClick={() => onSelectInput('STRUM_DOWN')}
          style={{ cursor: 'pointer' }}
        >
          {isSelected('STRUM_DOWN') && renderHighlightRect(18, 48, 74, 30, 4)}
          <rect
            x="18"
            y="48"
            width="74"
            height="30"
            rx="4"
            fill={isActive('STRUM_DOWN') ? ACCENT : '#2b2d3d'}
            stroke="#45495e"
            strokeWidth="1.5"
            filter={isActive('STRUM_DOWN') ? 'url(#crkd-glow)' : undefined}
          />
          <polygon points="55,72 45,56 65,56" fill="#ffffff" />
          <text x="75" y="66" fill="#ffffff" fontSize="8" fontWeight="bold">DOWN</text>
        </g>

        <text x="55" y="102" textAnchor="middle" fill="#757991" fontSize="8" fontWeight="bold">
          KAILH BOX CLICKY STRUM
        </text>
      </g>

      {/* CRKD Specific Button Cluster: D-Pad, Start, Select, Guide, Tilt */}
      {/* Precision D-Pad */}
      <g id="dpad" transform="translate(65, 460)">
        {[
          { code: 'DPAD_UP', x: 22, y: 0, w: 18, h: 22, l: '▲' },
          { code: 'DPAD_DOWN', x: 22, y: 40, w: 18, h: 22, l: '▼' },
          { code: 'DPAD_LEFT', x: 0, y: 22, w: 22, h: 18, l: '◀' },
          { code: 'DPAD_RIGHT', x: 40, y: 22, w: 22, h: 18, l: '▶' },
        ].map((d) => (
          <g
            key={d.code}
            data-input-code={d.code}
            onClick={() => onSelectInput(d.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(d.code) && renderHighlightRect(d.x, d.y, d.w, d.h, 3)}
            <rect
              x={d.x}
              y={d.y}
              width={d.w}
              height={d.h}
              rx="3"
              fill={isActive(d.code) ? ACCENT : '#2c2e3c'}
              stroke="#434658"
              strokeWidth="1"
              filter={isActive(d.code) ? 'url(#crkd-glow)' : undefined}
            />
            <text x={d.x + d.w / 2} y={d.y + d.h / 2 + 3} textAnchor="middle" fill="#fff" fontSize="8">
              {d.l}
            </text>
          </g>
        ))}
        <rect x="22" y="22" width="18" height="18" fill="#20222d" />
      </g>

      {/* Tilt Sensor Pod */}
      <g
        data-input-code="TILT"
        onClick={() => onSelectInput('TILT')}
        style={{ cursor: 'pointer' }}
        transform="translate(60, 360)"
      >
        {isSelected('TILT') && renderHighlightRect(0, 0, 65, 45, 6)}
        <rect x="0" y="0" width="65" height="45" rx="6" fill="#1b1d28" stroke="#3d4054" strokeWidth="1.5" />
        <line
          x1="32"
          y1="22"
          x2={32 + Math.cos((Math.PI / 4) * (tiltValue / 100)) * 20}
          y2={22 - Math.sin((Math.PI / 4) * (tiltValue / 100)) * 20}
          stroke={tiltValue > 60 || isActive('TILT') ? ACCENT : '#00d2d3'}
          strokeWidth="3"
          strokeLinecap="round"
          filter={tiltValue > 60 || isActive('TILT') ? 'url(#crkd-glow)' : undefined}
        />
        <circle cx="32" cy="22" r="3.5" fill="#ffffff" />
        <text x="32" y="38" textAnchor="middle" fill="#888eab" fontSize="7" fontWeight="bold">
          STAR POWER / TILT
        </text>
      </g>

      {/* Whammy Bar System */}
      <g
        data-input-code="WHAMMY"
        onClick={() => onSelectInput('WHAMMY')}
        style={{ cursor: 'pointer' }}
        transform="translate(290, 460)"
      >
        {isSelected('WHAMMY') && renderHighlightCircle(30, 40, 38)}
        <circle cx="30" cy="40" r="36" fill="#171822" stroke="#36384a" strokeWidth="1.5" />
        {/* Whammy Arc Gauge */}
        <path
          d="M 10 60 A 25 25 0 0 1 50 60"
          fill="none"
          stroke="#2a2c3a"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={`M 10 60 A 25 25 0 0 1 ${10 + 40 * (whammyValue / 100)} ${60 - Math.sin(Math.PI * (whammyValue / 100)) * 25}`}
          fill="none"
          stroke={ACCENT}
          strokeWidth="6"
          strokeLinecap="round"
          filter="url(#crkd-glow)"
        />
        {/* Metal Whammy Bar Lever */}
        <line
          x1="30"
          y1="40"
          x2={30 + Math.cos(Math.PI * (1 - whammyValue / 100)) * 32}
          y2={40 - Math.sin(Math.PI * (1 - whammyValue / 100)) * 32}
          stroke="#dcdde1"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="30" cy="40" r="6" fill="#57606f" stroke="#2f3542" strokeWidth="1.5" />
        <text x="30" y="88" textAnchor="middle" fill="#888eab" fontSize="8" fontWeight="bold">
          WHAMMY ({Math.round(whammyValue)}%)
        </text>
      </g>

      {/* Control Buttons (Select, Start, Home/Guide) */}
      {[
        { code: 'BTN_SELECT', label: 'SELECT', cx: 165, cy: 560 },
        { code: 'BTN_START', label: 'START', cx: 235, cy: 560 },
        { code: 'BTN_MODE', label: 'CRKD', cx: 200, cy: 610, r: 16 },
      ].map((btn) => {
        const radius = btn.r || 12;
        const active = isActive(btn.code);
        const selected = isSelected(btn.code);

        return (
          <g
            key={btn.code}
            data-input-code={btn.code}
            onClick={() => onSelectInput(btn.code)}
            style={{ cursor: 'pointer' }}
          >
            {selected && renderHighlightCircle(btn.cx, btn.cy, radius)}
            <circle
              cx={btn.cx}
              cy={btn.cy}
              r={radius}
              fill={active ? ACCENT : '#242634'}
              stroke={active ? '#ffffff' : '#45485d'}
              strokeWidth="1.5"
              filter={active ? 'url(#crkd-glow)' : undefined}
            />
            <text
              x={btn.cx}
              y={btn.cy + 3}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={btn.r ? 9 : 7}
              fontWeight="bold"
              pointerEvents="none"
            >
              {btn.label}
            </text>
          </g>
        );
      })}

      {/* Branding Plate */}
      <text x="200" y="650" textAnchor="middle" fill="#4d5066" fontSize="10" fontWeight="bold" letterSpacing="4">
        CRKD PRO GUITAR
      </text>
    </svg>
  );
};

export default CRKDGuitar;
