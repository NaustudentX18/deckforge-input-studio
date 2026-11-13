import React, { useMemo, useState } from 'react';

interface FightstickProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
  mode?: 'joystick' | 'leverless';
}

const ACCENT = '#e94560';

interface ArcadeButton {
  code: string;
  label: string;
  subLabel: string;
  cx: number;
  cy: number;
  r: number;
  rimColor: string;
  capColor: string;
}

export const Fightstick: React.FC<FightstickProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
  mode: initialMode = 'joystick',
}) => {
  const [stickMode, setStickMode] = useState<'joystick' | 'leverless'>(initialMode);

  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const getValue = (code: string) => activeInputs.get(code) ?? 0;
  const isSelected = (code: string) => selectedInput === code;

  const svgStyle = useMemo(
    () => ({ width: 600 * scale, height: 300 * scale }),
    [scale],
  );

  // Joystick deflection
  const stickX = getValue('AXIS_LX');
  const stickY = getValue('AXIS_LY');
  const normStick = (val: number) => {
    const clamped = Math.max(-1, Math.min(1, Math.abs(val) > 1 ? val / 32767 : val));
    return clamped * 20;
  };

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

  const renderHighlightRect = (x: number, y: number, w: number, h: number, rx = 4) => (
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

  // Standard 8-button arcade layout (Vewlix/Noir hybrid curve)
  // Top row: LP, MP, HP, PPP
  // Bottom row: LK, MK, HK, KKK
  const arcadeButtons: ArcadeButton[] = [
    // Top Row (Punches)
    { code: 'BTN_WEST', label: 'LP', subLabel: 'X', cx: 330, cy: 140, r: 19, rimColor: '#2b2d3a', capColor: '#3498db' },
    { code: 'BTN_NORTH', label: 'MP', subLabel: 'Y', cx: 380, cy: 125, r: 19, rimColor: '#2b2d3a', capColor: '#f1c40f' },
    { code: 'BTN_TR', label: 'HP', subLabel: 'RB', cx: 430, cy: 125, r: 19, rimColor: '#2b2d3a', capColor: '#e74c3c' },
    { code: 'BTN_TL', label: 'PPP', subLabel: 'LB', cx: 480, cy: 135, r: 19, rimColor: '#2b2d3a', capColor: '#9b59b6' },

    // Bottom Row (Kicks)
    { code: 'BTN_SOUTH', label: 'LK', subLabel: 'A', cx: 330, cy: 195, r: 19, rimColor: '#2b2d3a', capColor: '#2ecc71' },
    { code: 'BTN_EAST', label: 'MK', subLabel: 'B', cx: 380, cy: 180, r: 19, rimColor: '#2b2d3a', capColor: '#e67e22' },
    { code: 'BTN_TR2', label: 'HK', subLabel: 'RT', cx: 430, cy: 180, r: 19, rimColor: '#2b2d3a', capColor: '#1abc9c' },
    { code: 'BTN_TL2', label: 'KKK', subLabel: 'LT', cx: 480, cy: 190, r: 19, rimColor: '#2b2d3a', capColor: '#e91e63' },
  ];

  // Leverless Directional Buttons (Hitbox: Left, Down, Right, Up/Jump)
  const leverlessButtons: ArcadeButton[] = [
    { code: 'BTN_DPAD_LEFT', label: 'LEFT', subLabel: '◀', cx: 105, cy: 165, r: 17, rimColor: '#2b2d3a', capColor: '#e74c3c' },
    { code: 'BTN_DPAD_DOWN', label: 'DOWN', subLabel: '▼', cx: 150, cy: 155, r: 17, rimColor: '#2b2d3a', capColor: '#e74c3c' },
    { code: 'BTN_DPAD_RIGHT', label: 'RIGHT', subLabel: '▶', cx: 195, cy: 165, r: 17, rimColor: '#2b2d3a', capColor: '#e74c3c' },
    { code: 'BTN_DPAD_UP', label: 'UP', subLabel: '▲', cx: 210, cy: 235, r: 23, rimColor: '#2b2d3a', capColor: '#e74c3c' },
  ];

  // Aux Buttons
  const auxButtons = [
    { code: 'BTN_SELECT', label: 'SELECT', cx: 160, cy: 40, w: 32, h: 18 },
    { code: 'BTN_START', label: 'START', cx: 205, cy: 40, w: 32, h: 18 },
    { code: 'BTN_MODE', label: 'HOME', cx: 250, cy: 40, w: 32, h: 18 },
    { code: 'BTN_TURBO', label: 'TURBO', cx: 295, cy: 40, w: 32, h: 18 },
    { code: 'BTN_THUMBL', label: 'L3', cx: 340, cy: 40, w: 28, h: 18 },
    { code: 'BTN_THUMBR', label: 'R3', cx: 380, cy: 40, w: 28, h: 18 },
  ];

  return (
    <svg
      viewBox="0 0 600 300"
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
      className="deckforge-fightstick"
    >
      <defs>
        <filter id="fs-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="fs-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <linearGradient id="fs-panel-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c2d3a" />
          <stop offset="30%" stopColor="#1e1f29" />
          <stop offset="100%" stopColor="#15161f" />
        </linearGradient>
        <radialGradient id="fs-balltop-grad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ff7675" />
          <stop offset="40%" stopColor="#d63031" />
          <stop offset="100%" stopColor="#631011" />
        </radialGradient>
        <radialGradient id="fs-rim-grad" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="#1c1d27" />
          <stop offset="100%" stopColor="#3d4054" />
        </radialGradient>
      </defs>

      {/* Main Enclosure / Top Panel */}
      <rect
        x="15"
        y="12"
        width="570"
        height="276"
        rx="22"
        fill="url(#fs-panel-grad)"
        stroke="#3d4052"
        strokeWidth="3"
        filter="url(#fs-shadow)"
      />

      {/* Acrylic Edge / Bezel Inset */}
      <rect
        x="24"
        y="20"
        width="552"
        height="260"
        rx="16"
        fill="none"
        stroke="#272938"
        strokeWidth="1.5"
      />

      {/* Mode Switcher Button (Joystick vs Leverless) */}
      <g
        onClick={() => setStickMode((m) => (m === 'joystick' ? 'leverless' : 'joystick'))}
        style={{ cursor: 'pointer' }}
      >
        <rect x="430" y="32" width="130" height="22" rx="4" fill="#20222d" stroke="#484b61" strokeWidth="1" />
        <text x="495" y="47" textAnchor="middle" fill="#8d92ab" fontSize="9" fontWeight="bold">
          MODE: {stickMode.toUpperCase()} ⟳
        </text>
      </g>

      {/* Aux Buttons Bar */}
      <g id="aux-buttons">
        {auxButtons.map((btn) => (
          <g
            key={btn.code}
            data-input-code={btn.code}
            onClick={() => onSelectInput(btn.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(btn.code) && renderHighlightRect(btn.cx, btn.cy, btn.w, btn.h, 3)}
            <rect
              x={btn.cx}
              y={btn.cy}
              width={btn.w}
              height={btn.h}
              rx="3"
              fill={isActive(btn.code) ? ACCENT : '#2b2d3a'}
              stroke="#434657"
              strokeWidth="1.2"
              filter={isActive(btn.code) ? 'url(#fs-glow)' : undefined}
            />
            <text
              x={btn.cx + btn.w / 2}
              y={btn.cy + btn.h / 2 + 3}
              textAnchor="middle"
              fill={isActive(btn.code) ? '#fff' : '#a0a5bc'}
              fontSize="8"
              fontWeight="bold"
              pointerEvents="none"
            >
              {btn.label}
            </text>
          </g>
        ))}
      </g>

      {/* Joystick / Lever OR Leverless Directional Buttons */}
      {stickMode === 'joystick' ? (
        <g id="joystick-assembly">
          {/* Dust Washer Base */}
          <circle cx="160" cy="165" r="42" fill="#14151b" stroke="#333544" strokeWidth="2" />
          <circle cx="160" cy="165" r="30" fill="#1f202b" stroke="#252735" strokeWidth="1" />

          {/* Shaft & Balltop */}
          <g
            data-input-code="JOYSTICK_LEVER"
            onClick={() => onSelectInput('JOYSTICK_LEVER')}
            style={{ cursor: 'pointer' }}
          >
            {isSelected('JOYSTICK_LEVER') && renderHighlightCircle(160 + normStick(stickX), 165 + normStick(stickY), 25)}
            {/* Shaft */}
            <line
              x1="160"
              y1="165"
              x2={160 + normStick(stickX)}
              y2={165 + normStick(stickY)}
              stroke="#bdc3c7"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* Balltop */}
            <circle
              cx={160 + normStick(stickX)}
              cy={165 + normStick(stickY)}
              r="24"
              fill="url(#fs-balltop-grad)"
              stroke={isActive('JOYSTICK_LEVER') ? ACCENT : '#441416'}
              strokeWidth={isActive('JOYSTICK_LEVER') ? 3 : 1.5}
              filter={isActive('JOYSTICK_LEVER') ? 'url(#fs-glow)' : undefined}
            />
            {/* Highlight spec */}
            <ellipse
              cx={154 + normStick(stickX)}
              cy={157 + normStick(stickY)}
              rx="6"
              ry="4"
              fill="rgba(255,255,255,0.4)"
              pointerEvents="none"
            />
          </g>
          <text x="160" y="235" textAnchor="middle" fill="#757991" fontSize="10" fontWeight="bold">
            SANWA JLF LEVER
          </text>
        </g>
      ) : (
        <g id="leverless-assembly">
          {leverlessButtons.map((btn) => (
            <g
              key={btn.code}
              data-input-code={btn.code}
              onClick={() => onSelectInput(btn.code)}
              style={{ cursor: 'pointer' }}
            >
              {isSelected(btn.code) && renderHighlightCircle(btn.cx, btn.cy, btn.r)}
              {/* Outer Bezel Rim */}
              <circle cx={btn.cx} cy={btn.cy} r={btn.r} fill="url(#fs-rim-grad)" stroke="#4d5066" strokeWidth="1.5" />
              {/* Plunger */}
              <circle
                cx={btn.cx}
                cy={btn.cy}
                r={btn.r - 3}
                fill={isActive(btn.code) ? ACCENT : btn.capColor}
                stroke="#1e2029"
                strokeWidth="1.5"
                filter={isActive(btn.code) ? 'url(#fs-glow)' : undefined}
              />
              <text
                x={btn.cx}
                y={btn.cy + 3}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={btn.r > 20 ? 10 : 8}
                fontWeight="bold"
                pointerEvents="none"
              >
                {btn.subLabel}
              </text>
            </g>
          ))}
          <text x="160" y="278" textAnchor="middle" fill="#757991" fontSize="9" fontWeight="bold">
            ALL-BUTTON HITBOX LAYOUT
          </text>
        </g>
      )}

      {/* 8-Button Arcade Layout */}
      <g id="action-buttons">
        {arcadeButtons.map((btn) => (
          <g
            key={btn.code}
            data-input-code={btn.code}
            onClick={() => onSelectInput(btn.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(btn.code) && renderHighlightCircle(btn.cx, btn.cy, btn.r)}
            {/* Outer Bezel Rim */}
            <circle cx={btn.cx} cy={btn.cy} r={btn.r} fill="url(#fs-rim-grad)" stroke="#4d5066" strokeWidth="1.5" />
            {/* Plunger */}
            <circle
              cx={btn.cx}
              cy={btn.cy}
              r={btn.r - 3.5}
              fill={isActive(btn.code) ? ACCENT : btn.capColor}
              stroke="#1e2029"
              strokeWidth="1.5"
              filter={isActive(btn.code) ? 'url(#fs-glow)' : undefined}
            />
            {/* Plunger Highlight Reflection */}
            <path
              d={`M ${btn.cx - 9} ${btn.cy - 7} A 11 11 0 0 1 ${btn.cx + 9} ${btn.cy - 7}`}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              pointerEvents="none"
            />
            {/* Label */}
            <text
              x={btn.cx}
              y={btn.cy + 3}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9"
              fontWeight="bold"
              pointerEvents="none"
            >
              {btn.label}
            </text>
            <text
              x={btn.cx}
              y={btn.cy + 12}
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              fontSize="7"
              pointerEvents="none"
            >
              {btn.subLabel}
            </text>
          </g>
        ))}
      </g>

      {/* Corner Mounting Screws */}
      {[
        { cx: 32, cy: 30 },
        { cx: 568, cy: 30 },
        { cx: 32, cy: 270 },
        { cx: 568, cy: 270 },
      ].map((pos, i) => (
        <g key={i}>
          <circle cx={pos.cx} cy={pos.cy} r="4" fill="#3a3c4c" stroke="#1f202b" strokeWidth="1" />
          <line x1={pos.cx - 2.5} y1={pos.cy} x2={pos.cx + 2.5} y2={pos.cy} stroke="#1f202b" strokeWidth="1" />
        </g>
      ))}

      {/* Brand Watermark */}
      <text x="300" y="278" textAnchor="middle" fill="#3e4153" fontSize="10" fontWeight="bold" letterSpacing="3">
        DECKFORGE PRO FIGHTSTICK
      </text>
    </svg>
  );
};

export default Fightstick;
