import React, { useMemo } from 'react';

interface KeyboardMacropadProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
  rows?: number;
  cols?: number;
  encoders?: number;
  keyLabels?: Record<string, string>;
  keyColors?: Record<string, string>;
}

const ACCENT = '#e94560';

export const KeyboardMacropad: React.FC<KeyboardMacropadProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
  rows = 4,
  cols = 4,
  encoders = 2,
  keyLabels = {},
  keyColors = {},
}) => {
  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const getValue = (code: string) => activeInputs.get(code) ?? 0;
  const isSelected = (code: string) => selectedInput === code;

  const keySize = 54;
  const keyGap = 12;
  const padX = 30;
  const padY = 30;

  const numEncoders = Math.min(8, Math.max(0, encoders));
  const encoderSectionHeight = numEncoders > 0 ? 90 : 0;

  const gridWidth = cols * keySize + (cols - 1) * keyGap;
  const gridHeight = rows * keySize + (rows - 1) * keyGap;

  const encoderWidth = numEncoders > 0 ? numEncoders * 65 : 0;
  const contentWidth = Math.max(gridWidth, encoderWidth);

  const totalWidth = contentWidth + padX * 2;
  const totalHeight = gridHeight + encoderSectionHeight + padY * 2;

  const svgStyle = useMemo(
    () => ({ width: totalWidth * scale, height: totalHeight * scale }),
    [totalWidth, totalHeight, scale],
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

  const renderHighlightRect = (x: number, y: number, w: number, h: number, rx = 6) => (
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

  // Generate Key Cells
  const keys: Array<{ code: string; label: string; x: number; y: number; color?: string }> = [];
  const startX = padX + (contentWidth - gridWidth) / 2;
  const startY = padY + encoderSectionHeight;

  let keyIndex = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const code = `KEY_${keyIndex}`;
      const defaultLabel = keyLabels[code] || `K${keyIndex}`;
      const customColor = keyColors[code];
      const x = startX + c * (keySize + keyGap);
      const y = startY + r * (keySize + keyGap);
      keys.push({ code, label: defaultLabel, x, y, color: customColor });
      keyIndex++;
    }
  }

  // Generate Rotary Encoders
  const encoderList: Array<{ code: string; pressCode: string; label: string; cx: number; cy: number }> = [];
  if (numEncoders > 0) {
    const encSpacing = contentWidth / numEncoders;
    for (let i = 0; i < numEncoders; i++) {
      const code = `ENC_${i + 1}`;
      const pressCode = `ENC_PRESS_${i + 1}`;
      const label = `ENC ${i + 1}`;
      const cx = padX + encSpacing * i + encSpacing / 2;
      const cy = padY + 35;
      encoderList.push({ code, pressCode, label, cx, cy });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
      className="deckforge-keyboard-macropad"
    >
      <defs>
        <filter id="mp-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="mp-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <linearGradient id="mp-chassis-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#282a36" />
          <stop offset="100%" stopColor="#191a21" />
        </linearGradient>
        <linearGradient id="mp-keycap-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#44475a" />
          <stop offset="100%" stopColor="#2c2d3a" />
        </linearGradient>
        <radialGradient id="mp-knob-grad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#6272a4" />
          <stop offset="60%" stopColor="#282a36" />
          <stop offset="100%" stopColor="#191a21" />
        </radialGradient>
      </defs>

      {/* Macropad Enclosure */}
      <rect
        x="10"
        y="10"
        width={totalWidth - 20}
        height={totalHeight - 20}
        rx="16"
        fill="url(#mp-chassis-grad)"
        stroke="#44475a"
        strokeWidth="2.5"
        filter="url(#mp-shadow)"
      />

      {/* Decorative Branding */}
      <text
        x={totalWidth / 2}
        y={totalHeight - 16}
        textAnchor="middle"
        fill="#44475a"
        fontSize="9"
        fontWeight="bold"
        letterSpacing="2"
      >
        DECKFORGE MACROPAD {rows}×{cols}
      </text>

      {/* Rotary Encoders */}
      {encoderList.map((enc) => {
        const val = getValue(enc.code); // e.g. angle -180 to 180 or 0 to 100
        const angle = (val % 360) * (Math.PI / 180);
        const radius = 22;
        const knobX = enc.cx + Math.sin(angle) * (radius - 7);
        const knobY = enc.cy - Math.cos(angle) * (radius - 7);
        const encActive = isActive(enc.code) || isActive(enc.pressCode);

        return (
          <g key={enc.code} id={enc.code}>
            {/* Base Ring / Dial Track */}
            <circle cx={enc.cx} cy={enc.cy} r={radius + 4} fill="#1d1e26" stroke="#383a48" strokeWidth="1.5" />

            {/* Position Arc track */}
            <path
              d={`M ${enc.cx - 20} ${enc.cy + 12} A 23 23 0 1 1 ${enc.cx + 20} ${enc.cy + 12}`}
              fill="none"
              stroke="#343746"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Encoder Turn Interactive Group */}
            <g
              data-input-code={enc.code}
              onClick={() => onSelectInput(enc.code)}
              style={{ cursor: 'pointer' }}
            >
              {isSelected(enc.code) && renderHighlightCircle(enc.cx, enc.cy, radius + 2)}
              {/* Outer Knob Rim */}
              <circle
                cx={enc.cx}
                cy={enc.cy}
                r={radius}
                fill="url(#mp-knob-grad)"
                stroke={isActive(enc.code) ? ACCENT : '#6272a4'}
                strokeWidth={isActive(enc.code) ? 2.5 : 1}
                filter={encActive ? 'url(#mp-glow)' : undefined}
              />
              {/* Position Marker Pip */}
              <circle cx={knobX} cy={knobY} r="3" fill={ACCENT} />
            </g>

            {/* Center Push Button */}
            <g
              data-input-code={enc.pressCode}
              onClick={(e) => {
                e.stopPropagation();
                onSelectInput(enc.pressCode);
              }}
              style={{ cursor: 'pointer' }}
            >
              {isSelected(enc.pressCode) && renderHighlightCircle(enc.cx, enc.cy, 9)}
              <circle
                cx={enc.cx}
                cy={enc.cy}
                r="9"
                fill={isActive(enc.pressCode) ? ACCENT : '#21222c'}
                stroke="#6272a4"
                strokeWidth="1"
              />
              <text x={enc.cx} y={enc.cy + 2.5} textAnchor="middle" fill="#f8f8f2" fontSize="6" fontWeight="bold">
                PUSH
              </text>
            </g>

            {/* Encoder Label */}
            <text x={enc.cx} y={enc.cy + radius + 14} textAnchor="middle" fill="#8b90a6" fontSize="8" fontWeight="bold">
              {enc.label}
            </text>
          </g>
        );
      })}

      {/* Key Matrix */}
      <g id="keys-group">
        {keys.map((key) => {
          const active = isActive(key.code);
          const selected = isSelected(key.code);
          const baseColor = key.color || '#383a48';

          return (
            <g
              key={key.code}
              data-input-code={key.code}
              onClick={() => onSelectInput(key.code)}
              style={{ cursor: 'pointer' }}
            >
              {selected && renderHighlightRect(key.x, key.y, keySize, keySize, 7)}

              {/* Keycap Outer Body / Switch Housing */}
              <rect
                x={key.x}
                y={key.y}
                width={keySize}
                height={keySize}
                rx="7"
                fill="#191a21"
                stroke="#2d2f3d"
                strokeWidth="1.5"
              />

              {/* Keycap Top Face */}
              <rect
                x={key.x + 3}
                y={key.y + 3}
                width={keySize - 6}
                height={keySize - 6}
                rx="5"
                fill={active ? ACCENT : (key.color ? baseColor : 'url(#mp-keycap-grad)')}
                stroke={active ? '#fff' : '#4f5367'}
                strokeWidth={active ? 2 : 1}
                filter={active ? 'url(#mp-glow)' : undefined}
              />

              {/* Keycap Bevel Glint */}
              <line
                x1={key.x + 5}
                y1={key.y + 5}
                x2={key.x + keySize - 5}
                y2={key.y + 5}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
                pointerEvents="none"
              />

              {/* Primary Label */}
              <text
                x={key.x + keySize / 2}
                y={key.y + keySize / 2}
                textAnchor="middle"
                fill={active ? '#ffffff' : '#f8f8f2'}
                fontSize="11"
                fontWeight="bold"
                pointerEvents="none"
              >
                {key.label}
              </text>

              {/* Sub-label: Raw evdev key code */}
              <text
                x={key.x + keySize / 2}
                y={key.y + keySize - 7}
                textAnchor="middle"
                fill={active ? 'rgba(255,255,255,0.8)' : '#8b90a6'}
                fontSize="7"
                pointerEvents="none"
              >
                {key.code}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export default KeyboardMacropad;
