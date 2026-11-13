import React, { useMemo } from 'react';
import { fitSvgStyle } from '../../utils/svgFit';

interface GuitarControllerProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
}

const FRET_COLORS = [
  { code: 'FRET_GREEN', fill: '#2ecc40', label: 'Green' },
  { code: 'FRET_RED', fill: '#e74c3c', label: 'Red' },
  { code: 'FRET_YELLOW', fill: '#f1c40f', label: 'Yellow' },
  { code: 'FRET_BLUE', fill: '#3498db', label: 'Blue' },
  { code: 'FRET_ORANGE', fill: '#e67e22', label: 'Orange' },
];

const SOLO_FRETS = [
  { code: 'SOLO_GREEN', fill: '#2ecc40' },
  { code: 'SOLO_RED', fill: '#e74c3c' },
  { code: 'SOLO_YELLOW', fill: '#f1c40f' },
  { code: 'SOLO_BLUE', fill: '#3498db' },
  { code: 'SOLO_ORANGE', fill: '#e67e22' },
];

const ACCENT = '#e94560';

const GuitarController: React.FC<GuitarControllerProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
}) => {
  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const isSelected = (code: string) => selectedInput === code;

  const whammyValue = activeInputs.get('WHAMMY') ?? 0;
  const tiltValue = activeInputs.get('TILT') ?? 0;

  const svgStyle = useMemo(
    () => fitSvgStyle(400, 700, scale),
    [scale],
  );

  const renderHighlight = (cx: number, cy: number, r: number) => (
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

  return (
    <svg
      viewBox="0 0 400 700"
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Body gradient */}
        <linearGradient id="gc-body-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3a4a" />
          <stop offset="100%" stopColor="#1a1a2e" />
        </linearGradient>
        {/* Neck gradient */}
        <linearGradient id="gc-neck-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5c3d2e" />
          <stop offset="50%" stopColor="#8b6f47" />
          <stop offset="100%" stopColor="#5c3d2e" />
        </linearGradient>
        {/* Fret glow */}
        <filter id="gc-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Shadow */}
        <filter id="gc-shadow">
          <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
        </filter>
        {/* Button bevel */}
        <radialGradient id="gc-btn-bevel" cx="40%" cy="35%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Guitar body silhouette */}
      <path
        d="M120,320 C60,340 30,420 40,500 C50,580 100,640 160,660
           C190,670 210,670 240,660 C300,640 350,580 360,500
           C370,420 340,340 280,320 L280,80 C280,60 270,50 260,50
           L140,50 C130,50 120,60 120,80 Z"
        fill="url(#gc-body-grad)"
        stroke="#555"
        strokeWidth="2"
        filter="url(#gc-shadow)"
      />

      {/* Neck */}
      <rect
        x="130"
        y="50"
        width="140"
        height="200"
        rx="5"
        fill="url(#gc-neck-grad)"
        stroke="#3e2a1a"
        strokeWidth="1.5"
      />

      {/* Fret wires */}
      {[90, 130, 170, 210].map((y) => (
        <line key={y} x1="130" y1={y} x2="270" y2={y} stroke="#ccc" strokeWidth="1.5" opacity="0.7" />
      ))}

      {/* Main fret buttons */}
      {FRET_COLORS.map((fret, i) => {
        const cx = 150 + i * 30;
        const cy = 75;
        return (
          <g
            key={fret.code}
            data-input-code={fret.code}
            onClick={() => onSelectInput(fret.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(fret.code) && renderHighlight(cx, cy, 14)}
            <circle
              cx={cx}
              cy={cy}
              r="14"
              fill={fret.fill}
              stroke={isActive(fret.code) ? ACCENT : '#222'}
              strokeWidth={isActive(fret.code) ? 3 : 1.5}
              filter={isActive(fret.code) ? 'url(#gc-glow)' : undefined}
              opacity={isActive(fret.code) ? 1 : 0.85}
            />
            <circle cx={cx} cy={cy} r="14" fill="url(#gc-btn-bevel)" />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="7" fontWeight="bold" pointerEvents="none">
              {fret.label[0]}
            </text>
          </g>
        );
      })}

      {/* Solo fret buttons (smaller, below main frets) */}
      {SOLO_FRETS.map((fret, i) => {
        const cx = 150 + i * 30;
        const cy = 110;
        return (
          <g
            key={fret.code}
            data-input-code={fret.code}
            onClick={() => onSelectInput(fret.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(fret.code) && renderHighlight(cx, cy, 9)}
            <circle
              cx={cx}
              cy={cy}
              r="9"
              fill={fret.fill}
              stroke={isActive(fret.code) ? ACCENT : '#333'}
              strokeWidth={isActive(fret.code) ? 2.5 : 1}
              filter={isActive(fret.code) ? 'url(#gc-glow)' : undefined}
              opacity={isActive(fret.code) ? 1 : 0.65}
            />
            <circle cx={cx} cy={cy} r="9" fill="url(#gc-btn-bevel)" />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="5" pointerEvents="none">
              S
            </text>
          </g>
        );
      })}

      {/* Strum bar */}
      {(['STRUM_UP', 'STRUM_DOWN'] as const).map((code, idx) => {
        const y = idx === 0 ? 340 : 370;
        const arrowDir = idx === 0 ? -1 : 1;
        return (
          <g
            key={code}
            data-input-code={code}
            onClick={() => onSelectInput(code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(code) && (
              <rect x="155" y={y - 12} width="90" height="24" rx="6" fill="none" stroke={ACCENT} strokeWidth="3" strokeDasharray="6 3">
                <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.8s" repeatCount="indefinite" />
              </rect>
            )}
            <rect
              x="160"
              y={y - 10}
              width="80"
              height="20"
              rx="4"
              fill={isActive(code) ? ACCENT : '#555'}
              stroke="#333"
              strokeWidth="1.5"
              filter={isActive(code) ? 'url(#gc-glow)' : undefined}
            />
            {/* Directional arrow */}
            <polygon
              points={`200,${y + arrowDir * 6} 195,${y - arrowDir * 3} 205,${y - arrowDir * 3}`}
              fill="#eee"
              pointerEvents="none"
            />
            <text x="225" y={y + 2} textAnchor="middle" dominantBaseline="central" fill="#ccc" fontSize="7" pointerEvents="none">
              {idx === 0 ? '▲' : '▼'}
            </text>
          </g>
        );
      })}
      <text x="200" y="325" textAnchor="middle" fill="#888" fontSize="9" pointerEvents="none">
        STRUM BAR
      </text>

      {/* Whammy bar (arc) */}
      <g
        data-input-code="WHAMMY"
        onClick={() => onSelectInput('WHAMMY')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('WHAMMY') && (
          <circle cx="320" cy="430" r="44" fill="none" stroke={ACCENT} strokeWidth="3" strokeDasharray="6 3">
            <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.8s" repeatCount="indefinite" />
          </circle>
        )}
        {/* Background arc */}
        <path
          d="M290,460 A40,40 0 0,1 350,460"
          fill="none"
          stroke="#444"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Value arc */}
        {whammyValue > 0 && (
          <path
            d={`M290,460 A40,40 0 0,1 ${290 + 60 * (whammyValue / 100)},${460 - Math.sin(Math.PI * whammyValue / 100) * 40}`}
            fill="none"
            stroke={ACCENT}
            strokeWidth="8"
            strokeLinecap="round"
          />
        )}
        {/* Whammy arm */}
        <line
          x1="320"
          y1="430"
          x2={320 + Math.cos(Math.PI * (1 - whammyValue / 100)) * 35}
          y2={430 - Math.sin(Math.PI * (1 - whammyValue / 100)) * 35}
          stroke="#bbb"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="320" cy="430" r="5" fill="#888" stroke="#555" strokeWidth="1" />
        <text x="320" y="478" textAnchor="middle" fill="#888" fontSize="8" pointerEvents="none">
          WHAMMY {Math.round(whammyValue)}%
        </text>
      </g>

      {/* Tilt sensor indicator */}
      <g
        data-input-code="TILT"
        onClick={() => onSelectInput('TILT')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('TILT') && (
          <rect x="62" y="395" width="70" height="50" rx="6" fill="none" stroke={ACCENT} strokeWidth="3" strokeDasharray="6 3">
            <animate attributeName="stroke-dashoffset" from="0" to="18" dur="0.8s" repeatCount="indefinite" />
          </rect>
        )}
        <rect x="67" y="400" width="60" height="40" rx="4" fill="#2a2a3e" stroke="#555" strokeWidth="1" />
        {/* Tilt bar */}
        <line
          x1="97"
          y1="420"
          x2={97 + Math.cos((Math.PI / 4) * (tiltValue / 100)) * 22}
          y2={420 - Math.sin((Math.PI / 4) * (tiltValue / 100)) * 22}
          stroke={tiltValue > 60 ? ACCENT : '#aaa'}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="97" cy="420" r="3" fill="#ccc" />
        <text x="97" y="448" textAnchor="middle" fill="#888" fontSize="7" pointerEvents="none">
          TILT
        </text>
      </g>

      {/* D-pad */}
      {[
        { code: 'DPAD_UP', dx: 0, dy: -18, w: 18, h: 16 },
        { code: 'DPAD_DOWN', dx: 0, dy: 18, w: 18, h: 16 },
        { code: 'DPAD_LEFT', dx: -18, dy: 0, w: 16, h: 18 },
        { code: 'DPAD_RIGHT', dx: 18, dy: 0, w: 16, h: 18 },
      ].map((d) => {
        const cx = 140;
        const cy = 500;
        const rx = cx + d.dx - d.w / 2;
        const ry = cy + d.dy - d.h / 2;
        return (
          <g
            key={d.code}
            data-input-code={d.code}
            onClick={() => onSelectInput(d.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(d.code) && (
              <rect x={rx - 3} y={ry - 3} width={d.w + 6} height={d.h + 6} rx="4" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeDasharray="5 3">
                <animate attributeName="stroke-dashoffset" from="0" to="16" dur="0.8s" repeatCount="indefinite" />
              </rect>
            )}
            <rect
              x={rx}
              y={ry}
              width={d.w}
              height={d.h}
              rx="3"
              fill={isActive(d.code) ? ACCENT : '#4a4a5e'}
              stroke="#333"
              strokeWidth="1"
              filter={isActive(d.code) ? 'url(#gc-glow)' : undefined}
            />
          </g>
        );
      })}
      {/* D-pad center nub */}
      <circle cx="140" cy="500" r="5" fill="#3a3a4e" stroke="#555" strokeWidth="1" pointerEvents="none" />
      <text x="140" y="530" textAnchor="middle" fill="#888" fontSize="8" pointerEvents="none">
        D-PAD
      </text>

      {/* Start, Select, Star Power/Guide */}
      {[
        { code: 'BTN_START', label: 'Start', cx: 230, cy: 490 },
        { code: 'BTN_SELECT', label: 'Select', cx: 230, cy: 515 },
        { code: 'BTN_GUIDE', label: '★', cx: 200, cy: 565 },
      ].map((btn) => (
        <g
          key={btn.code}
          data-input-code={btn.code}
          onClick={() => onSelectInput(btn.code)}
          style={{ cursor: 'pointer' }}
        >
          {isSelected(btn.code) && renderHighlight(btn.cx, btn.cy, btn.code === 'BTN_GUIDE' ? 14 : 10)}
          <circle
            cx={btn.cx}
            cy={btn.cy}
            r={btn.code === 'BTN_GUIDE' ? 14 : 10}
            fill={isActive(btn.code) ? ACCENT : '#4a4a5e'}
            stroke="#555"
            strokeWidth="1.5"
            filter={isActive(btn.code) ? 'url(#gc-glow)' : undefined}
          />
          <text
            x={btn.cx}
            y={btn.cy + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#eee"
            fontSize={btn.code === 'BTN_GUIDE' ? 12 : 7}
            fontWeight="bold"
            pointerEvents="none"
          >
            {btn.label}
          </text>
        </g>
      ))}

      {/* Sound hole decoration */}
      <ellipse cx="200" cy="600" rx="30" ry="30" fill="none" stroke="#444" strokeWidth="2" opacity="0.5" />
      <ellipse cx="200" cy="600" rx="25" ry="25" fill="none" stroke="#3a3a4a" strokeWidth="1" opacity="0.3" />

      {/* Headstock */}
      <path
        d="M130,50 L125,25 C123,15 135,5 150,5 L250,5 C265,5 277,15 275,25 L270,50"
        fill="#2a2a3a"
        stroke="#555"
        strokeWidth="1.5"
      />
      {/* Tuning pegs */}
      {[145, 170, 195, 220, 245].map((x) => (
        <circle key={x} cx={x} cy="18" r="5" fill="#888" stroke="#666" strokeWidth="1" />
      ))}
    </svg>
  );
};

export default GuitarController;
