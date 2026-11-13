import React, { useMemo } from 'react';

interface SteamDeckGamepadProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
}

const ACCENT = '#e94560';

export const SteamDeckGamepad: React.FC<SteamDeckGamepadProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
}) => {
  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const getValue = (code: string) => activeInputs.get(code) ?? 0;
  const isSelected = (code: string) => selectedInput === code;

  const svgStyle = useMemo(
    () => ({ width: 800 * scale, height: 500 * scale }),
    [scale],
  );

  const lStickX = getValue('AXIS_LX'); // -1 to 1 or -32768 to 32767
  const lStickY = getValue('AXIS_LY');
  const rStickX = getValue('AXIS_RX');
  const rStickY = getValue('AXIS_RY');

  // Normalize stick offsets (-1 to 1) -> pixel offset (-18 to 18)
  const normStick = (val: number) => {
    const clamped = Math.max(-1, Math.min(1, Math.abs(val) > 1 ? val / 32767 : val));
    return clamped * 18;
  };

  const l2Val = Math.max(0, Math.min(1, getValue('AXIS_L2') > 1 ? getValue('AXIS_L2') / 255 : getValue('AXIS_L2')));
  const r2Val = Math.max(0, Math.min(1, getValue('AXIS_R2') > 1 ? getValue('AXIS_R2') / 255 : getValue('AXIS_R2')));

  // Trackpad touch positions
  const lPadX = normStick(getValue('PAD_LX'));
  const lPadY = normStick(getValue('PAD_LY'));
  const rPadX = normStick(getValue('PAD_RX'));
  const rPadY = normStick(getValue('PAD_RY'));

  // Gyro
  const gyroRoll = getValue('GYRO_ROLL') || 0;
  const gyroPitch = getValue('GYRO_PITCH') || 0;
  const gyroYaw = getValue('GYRO_YAW') || 0;

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

  return (
    <svg
      viewBox="0 0 800 500"
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
      className="deckforge-steam-deck-gamepad"
    >
      <defs>
        <filter id="sd-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="sd-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.6" />
        </filter>
        <linearGradient id="sd-body-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#282a36" />
          <stop offset="60%" stopColor="#1e1f29" />
          <stop offset="100%" stopColor="#161720" />
        </linearGradient>
        <linearGradient id="sd-screen-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d0e15" />
          <stop offset="100%" stopColor="#08080d" />
        </linearGradient>
        <radialGradient id="sd-stick-grad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#44475a" />
          <stop offset="70%" stopColor="#21222c" />
          <stop offset="100%" stopColor="#191a21" />
        </radialGradient>
        <linearGradient id="sd-trackpad-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22232e" />
          <stop offset="100%" stopColor="#181922" />
        </linearGradient>
      </defs>

      {/* Main Steam Deck Body */}
      <g filter="url(#sd-shadow)">
        <path
          d="M 120,70 
             C 160,65 240,60 400,60 
             C 560,60 640,65 680,70 
             C 740,78 775,120 775,190 
             C 775,270 760,370 735,420 
             C 715,455 670,450 630,445 
             C 530,440 450,440 400,440 
             C 350,440 270,440 170,445 
             C 130,450 85,455 65,420 
             C 40,370 25,270 25,190 
             C 25,120 60,78 120,70 Z"
          fill="url(#sd-body-grad)"
          stroke="#383a48"
          strokeWidth="3"
        />
      </g>

      {/* Center 16:10 Screen */}
      <g>
        <rect x="250" y="115" width="300" height="210" rx="8" fill="#111219" stroke="#333544" strokeWidth="2" />
        <rect x="255" y="120" width="290" height="200" rx="4" fill="url(#sd-screen-grad)" />
        {/* Screen Bezel Accent / Logo */}
        <text x="400" y="215" textAnchor="middle" fill="#3a3d52" fontSize="20" fontWeight="bold" letterSpacing="4">
          STEAM DECK
        </text>
        <circle cx="400" cy="175" r="14" fill="none" stroke="#2c2f3f" strokeWidth="3" />
        <circle cx="400" cy="175" r="4" fill="#2c2f3f" />
      </g>

      {/* Bumpers & Triggers (L1, R1, L2, R2) */}
      {/* L1 Bumper */}
      <g
        data-input-code="BTN_TL"
        onClick={() => onSelectInput('BTN_TL')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_TL') && renderHighlightRect(90, 42, 95, 24, 6)}
        <rect
          x="90"
          y="42"
          width="95"
          height="24"
          rx="6"
          fill={isActive('BTN_TL') ? ACCENT : '#343746'}
          stroke="#4b4f63"
          strokeWidth="1.5"
          filter={isActive('BTN_TL') ? 'url(#sd-glow)' : undefined}
        />
        <text x="137" y="58" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">L1</text>
      </g>

      {/* R1 Bumper */}
      <g
        data-input-code="BTN_TR"
        onClick={() => onSelectInput('BTN_TR')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_TR') && renderHighlightRect(615, 42, 95, 24, 6)}
        <rect
          x="615"
          y="42"
          width="95"
          height="24"
          rx="6"
          fill={isActive('BTN_TR') ? ACCENT : '#343746'}
          stroke="#4b4f63"
          strokeWidth="1.5"
          filter={isActive('BTN_TR') ? 'url(#sd-glow)' : undefined}
        />
        <text x="662" y="58" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">R1</text>
      </g>

      {/* L2 Trigger with travel bar */}
      <g
        data-input-code="AXIS_L2"
        onClick={() => onSelectInput('AXIS_L2')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('AXIS_L2') && renderHighlightRect(90, 14, 95, 24, 6)}
        <rect x="90" y="14" width="95" height="24" rx="6" fill="#22242f" stroke="#4b4f63" strokeWidth="1.5" />
        {/* Travel fill bar */}
        <rect
          x="92"
          y="16"
          width={Math.max(4, 91 * (l2Val || (isActive('AXIS_L2') ? 1 : 0)))}
          height="20"
          rx="4"
          fill={l2Val > 0 || isActive('AXIS_L2') ? ACCENT : '#3d4154'}
          filter={l2Val > 0 || isActive('AXIS_L2') ? 'url(#sd-glow)' : undefined}
        />
        <text x="137" y="30" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">
          L2 {l2Val > 0 ? `(${Math.round(l2Val * 100)}%)` : ''}
        </text>
      </g>

      {/* R2 Trigger with travel bar */}
      <g
        data-input-code="AXIS_R2"
        onClick={() => onSelectInput('AXIS_R2')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('AXIS_R2') && renderHighlightRect(615, 14, 95, 24, 6)}
        <rect x="615" y="14" width="95" height="24" rx="6" fill="#22242f" stroke="#4b4f63" strokeWidth="1.5" />
        {/* Travel fill bar */}
        <rect
          x="617"
          y="16"
          width={Math.max(4, 91 * (r2Val || (isActive('AXIS_R2') ? 1 : 0)))}
          height="20"
          rx="4"
          fill={r2Val > 0 || isActive('AXIS_R2') ? ACCENT : '#3d4154'}
          filter={r2Val > 0 || isActive('AXIS_R2') ? 'url(#sd-glow)' : undefined}
        />
        <text x="662" y="30" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">
          R2 {r2Val > 0 ? `(${Math.round(r2Val * 100)}%)` : ''}
        </text>
      </g>

      {/* Left Analog Stick + L3 */}
      <g
        data-input-code="BTN_THUMBL"
        onClick={() => onSelectInput('BTN_THUMBL')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_THUMBL') && renderHighlightCircle(120, 140, 36)}
        <circle cx="120" cy="140" r="36" fill="#14151b" stroke="#3d4154" strokeWidth="2" />
        <circle
          cx={120 + normStick(lStickX)}
          cy={140 + normStick(lStickY)}
          r="26"
          fill="url(#sd-stick-grad)"
          stroke={isActive('BTN_THUMBL') ? ACCENT : '#5a5d72'}
          strokeWidth={isActive('BTN_THUMBL') ? 3 : 2}
          filter={isActive('BTN_THUMBL') ? 'url(#sd-glow)' : undefined}
        />
        {/* Stick Position Dot */}
        <circle
          cx={120 + normStick(lStickX)}
          cy={140 + normStick(lStickY)}
          r="4"
          fill={ACCENT}
          opacity={lStickX !== 0 || lStickY !== 0 ? 1 : 0.6}
        />
        <text x="120" y="185" textAnchor="middle" fill="#7d8196" fontSize="9" fontWeight="bold">L3</text>
      </g>

      {/* Right Analog Stick + R3 */}
      <g
        data-input-code="BTN_THUMBR"
        onClick={() => onSelectInput('BTN_THUMBR')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_THUMBR') && renderHighlightCircle(680, 140, 36)}
        <circle cx="680" cy="140" r="36" fill="#14151b" stroke="#3d4154" strokeWidth="2" />
        <circle
          cx={680 + normStick(rStickX)}
          cy={140 + normStick(rStickY)}
          r="26"
          fill="url(#sd-stick-grad)"
          stroke={isActive('BTN_THUMBR') ? ACCENT : '#5a5d72'}
          strokeWidth={isActive('BTN_THUMBR') ? 3 : 2}
          filter={isActive('BTN_THUMBR') ? 'url(#sd-glow)' : undefined}
        />
        {/* Stick Position Dot */}
        <circle
          cx={680 + normStick(rStickX)}
          cy={140 + normStick(rStickY)}
          r="4"
          fill={ACCENT}
          opacity={rStickX !== 0 || rStickY !== 0 ? 1 : 0.6}
        />
        <text x="680" y="185" textAnchor="middle" fill="#7d8196" fontSize="9" fontWeight="bold">R3</text>
      </g>

      {/* D-Pad Cross */}
      <g id="dpad-group">
        {[
          { code: 'BTN_DPAD_UP', x: 108, y: 200, w: 24, h: 28, label: '▲' },
          { code: 'BTN_DPAD_DOWN', x: 108, y: 254, w: 24, h: 28, label: '▼' },
          { code: 'BTN_DPAD_LEFT', x: 82, y: 226, w: 28, h: 24, label: '◀' },
          { code: 'BTN_DPAD_RIGHT', x: 134, y: 226, w: 28, h: 24, label: '▶' },
        ].map((btn) => (
          <g
            key={btn.code}
            data-input-code={btn.code}
            onClick={() => onSelectInput(btn.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(btn.code) && renderHighlightRect(btn.x, btn.y, btn.w, btn.h, 4)}
            <rect
              x={btn.x}
              y={btn.y}
              width={btn.w}
              height={btn.h}
              rx="4"
              fill={isActive(btn.code) ? ACCENT : '#2b2d3a'}
              stroke="#434657"
              strokeWidth="1.5"
              filter={isActive(btn.code) ? 'url(#sd-glow)' : undefined}
            />
            <text
              x={btn.x + btn.w / 2}
              y={btn.y + btn.h / 2 + 4}
              textAnchor="middle"
              fill={isActive(btn.code) ? '#fff' : '#8c90a4'}
              fontSize="10"
              pointerEvents="none"
            >
              {btn.label}
            </text>
          </g>
        ))}
        {/* DPad Center Plate */}
        <rect x="108" y="226" width="24" height="24" fill="#242631" />
      </g>

      {/* ABXY Diamond Buttons */}
      <g id="abxy-group">
        {[
          { code: 'BTN_NORTH', label: 'Y', cx: 680, cy: 215, color: '#f1c40f' },
          { code: 'BTN_WEST', label: 'X', cx: 652, cy: 240, color: '#3498db' },
          { code: 'BTN_EAST', label: 'B', cx: 708, cy: 240, color: '#e74c3c' },
          { code: 'BTN_SOUTH', label: 'A', cx: 680, cy: 265, color: '#2ecc71' },
        ].map((btn) => (
          <g
            key={btn.code}
            data-input-code={btn.code}
            onClick={() => onSelectInput(btn.code)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected(btn.code) && renderHighlightCircle(btn.cx, btn.cy, 13)}
            <circle
              cx={btn.cx}
              cy={btn.cy}
              r="13"
              fill={isActive(btn.code) ? ACCENT : '#2a2c3a'}
              stroke={isActive(btn.code) ? '#fff' : '#45485c'}
              strokeWidth="2"
              filter={isActive(btn.code) ? 'url(#sd-glow)' : undefined}
            />
            <text
              x={btn.cx}
              y={btn.cy + 4}
              textAnchor="middle"
              fill={isActive(btn.code) ? '#ffffff' : btn.color}
              fontSize="12"
              fontWeight="bold"
              pointerEvents="none"
            >
              {btn.label}
            </text>
          </g>
        ))}
      </g>

      {/* Left Trackpad */}
      <g
        data-input-code="TOUCH_LEFT"
        onClick={() => onSelectInput('TOUCH_LEFT')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('TOUCH_LEFT') && renderHighlightRect(90, 300, 60, 60, 8)}
        <rect
          x="90"
          y="300"
          width="60"
          height="60"
          rx="8"
          fill="url(#sd-trackpad-grad)"
          stroke={isActive('TOUCH_LEFT') ? ACCENT : '#3d4052'}
          strokeWidth="2"
          filter={isActive('TOUCH_LEFT') ? 'url(#sd-glow)' : undefined}
        />
        {/* Subtle grid pattern inside pad */}
        <circle cx="120" cy="330" r="22" fill="none" stroke="#2c2e3c" strokeWidth="1" strokeDasharray="3 3" />
        {/* Touch position dot */}
        <circle
          cx={120 + lPadX}
          cy={330 + lPadY}
          r="5"
          fill={ACCENT}
          opacity={lPadX !== 0 || lPadY !== 0 || isActive('TOUCH_LEFT') ? 1 : 0.4}
        />
        <text x="120" y="375" textAnchor="middle" fill="#7d8196" fontSize="9">LEFT PAD</text>
      </g>

      {/* Right Trackpad */}
      <g
        data-input-code="TOUCH_RIGHT"
        onClick={() => onSelectInput('TOUCH_RIGHT')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('TOUCH_RIGHT') && renderHighlightRect(650, 300, 60, 60, 8)}
        <rect
          x="650"
          y="300"
          width="60"
          height="60"
          rx="8"
          fill="url(#sd-trackpad-grad)"
          stroke={isActive('TOUCH_RIGHT') ? ACCENT : '#3d4052'}
          strokeWidth="2"
          filter={isActive('TOUCH_RIGHT') ? 'url(#sd-glow)' : undefined}
        />
        <circle cx="680" cy="330" r="22" fill="none" stroke="#2c2e3c" strokeWidth="1" strokeDasharray="3 3" />
        {/* Touch position dot */}
        <circle
          cx={680 + rPadX}
          cy={330 + rPadY}
          r="5"
          fill={ACCENT}
          opacity={rPadX !== 0 || rPadY !== 0 || isActive('TOUCH_RIGHT') ? 1 : 0.4}
        />
        <text x="680" y="375" textAnchor="middle" fill="#7d8196" fontSize="9">RIGHT PAD</text>
      </g>

      {/* Aux Buttons: View/Select, Menu/Start, Steam, QAM (...) */}
      {/* View / Select Button */}
      <g
        data-input-code="BTN_SELECT"
        onClick={() => onSelectInput('BTN_SELECT')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_SELECT') && renderHighlightCircle(188, 120, 11)}
        <circle
          cx="188"
          cy="120"
          r="11"
          fill={isActive('BTN_SELECT') ? ACCENT : '#2b2d39'}
          stroke="#414457"
          strokeWidth="1.5"
          filter={isActive('BTN_SELECT') ? 'url(#sd-glow)' : undefined}
        />
        <text x="188" y="123" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">⧉</text>
      </g>

      {/* Menu / Start Button */}
      <g
        data-input-code="BTN_START"
        onClick={() => onSelectInput('BTN_START')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_START') && renderHighlightCircle(612, 120, 11)}
        <circle
          cx="612"
          cy="120"
          r="11"
          fill={isActive('BTN_START') ? ACCENT : '#2b2d39'}
          stroke="#414457"
          strokeWidth="1.5"
          filter={isActive('BTN_START') ? 'url(#sd-glow)' : undefined}
        />
        <text x="612" y="123" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">☰</text>
      </g>

      {/* STEAM Button */}
      <g
        data-input-code="BTN_MODE"
        onClick={() => onSelectInput('BTN_MODE')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_MODE') && renderHighlightRect(174, 320, 52, 22, 5)}
        <rect
          x="174"
          y="320"
          width="52"
          height="22"
          rx="5"
          fill={isActive('BTN_MODE') ? ACCENT : '#272935'}
          stroke="#414457"
          strokeWidth="1.5"
          filter={isActive('BTN_MODE') ? 'url(#sd-glow)' : undefined}
        />
        <text x="200" y="335" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" letterSpacing="1">
          STEAM
        </text>
      </g>

      {/* QAM Button (...) */}
      <g
        data-input-code="BTN_QAM"
        onClick={() => onSelectInput('BTN_QAM')}
        style={{ cursor: 'pointer' }}
      >
        {isSelected('BTN_QAM') && renderHighlightRect(574, 320, 52, 22, 5)}
        <rect
          x="574"
          y="320"
          width="52"
          height="22"
          rx="5"
          fill={isActive('BTN_QAM') ? ACCENT : '#272935'}
          stroke="#414457"
          strokeWidth="1.5"
          filter={isActive('BTN_QAM') ? 'url(#sd-glow)' : undefined}
        />
        <text x="600" y="335" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold" letterSpacing="1">
          •••
        </text>
      </g>

      {/* Gyro Compass Indicator */}
      <g transform="translate(400, 385)">
        <circle cx="0" cy="0" r="26" fill="#13141b" stroke="#333544" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="2" fill="#666" />
        {/* Crosshair */}
        <line x1="-20" y1="0" x2="20" y2="0" stroke="#252735" strokeWidth="1" />
        <line x1="0" y1="-20" x2="0" y2="20" stroke="#252735" strokeWidth="1" />
        {/* 3-Axis Gyro needles */}
        <line
          x1="0"
          y1="0"
          x2={Math.sin(gyroYaw) * 18}
          y2={-Math.cos(gyroYaw) * 18}
          stroke="#2ecc71"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="0"
          y1="0"
          x2={Math.cos(gyroRoll) * 16}
          y2={Math.sin(gyroPitch) * 16}
          stroke={ACCENT}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="0" y="38" textAnchor="middle" fill="#7d8196" fontSize="8" fontWeight="bold">GYRO 3-AXIS</text>
      </g>

      {/* Back Grip Buttons (L4, L5, R4, R5) - Side View Ribbons */}
      <g id="back-grip-buttons">
        <text x="12" y="270" textAnchor="middle" fill="#60647a" fontSize="8" fontWeight="bold" transform="rotate(-90 12,270)">
          REAR GRIPS
        </text>
        <text x="788" y="270" textAnchor="middle" fill="#60647a" fontSize="8" fontWeight="bold" transform="rotate(90 788,270)">
          REAR GRIPS
        </text>

        {/* L4 (Upper Left Grip) */}
        <g
          data-input-code="BTN_TRIGGER_HAPPY1"
          onClick={() => onSelectInput('BTN_TRIGGER_HAPPY1')}
          style={{ cursor: 'pointer' }}
        >
          {isSelected('BTN_TRIGGER_HAPPY1') && renderHighlightRect(18, 200, 16, 42, 4)}
          <rect
            x="18"
            y="200"
            width="16"
            height="42"
            rx="4"
            fill={isActive('BTN_TRIGGER_HAPPY1') ? ACCENT : '#282a36'}
            stroke="#45485d"
            strokeWidth="1.5"
            filter={isActive('BTN_TRIGGER_HAPPY1') ? 'url(#sd-glow)' : undefined}
          />
          <text x="26" y="225" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">L4</text>
        </g>

        {/* L5 (Lower Left Grip) */}
        <g
          data-input-code="BTN_TRIGGER_HAPPY2"
          onClick={() => onSelectInput('BTN_TRIGGER_HAPPY2')}
          style={{ cursor: 'pointer' }}
        >
          {isSelected('BTN_TRIGGER_HAPPY2') && renderHighlightRect(22, 255, 16, 42, 4)}
          <rect
            x="22"
            y="255"
            width="16"
            height="42"
            rx="4"
            fill={isActive('BTN_TRIGGER_HAPPY2') ? ACCENT : '#282a36'}
            stroke="#45485d"
            strokeWidth="1.5"
            filter={isActive('BTN_TRIGGER_HAPPY2') ? 'url(#sd-glow)' : undefined}
          />
          <text x="30" y="280" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">L5</text>
        </g>

        {/* R4 (Upper Right Grip) */}
        <g
          data-input-code="BTN_TRIGGER_HAPPY3"
          onClick={() => onSelectInput('BTN_TRIGGER_HAPPY3')}
          style={{ cursor: 'pointer' }}
        >
          {isSelected('BTN_TRIGGER_HAPPY3') && renderHighlightRect(766, 200, 16, 42, 4)}
          <rect
            x="766"
            y="200"
            width="16"
            height="42"
            rx="4"
            fill={isActive('BTN_TRIGGER_HAPPY3') ? ACCENT : '#282a36'}
            stroke="#45485d"
            strokeWidth="1.5"
            filter={isActive('BTN_TRIGGER_HAPPY3') ? 'url(#sd-glow)' : undefined}
          />
          <text x="774" y="225" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">R4</text>
        </g>

        {/* R5 (Lower Right Grip) */}
        <g
          data-input-code="BTN_TRIGGER_HAPPY4"
          onClick={() => onSelectInput('BTN_TRIGGER_HAPPY4')}
          style={{ cursor: 'pointer' }}
        >
          {isSelected('BTN_TRIGGER_HAPPY4') && renderHighlightRect(762, 255, 16, 42, 4)}
          <rect
            x="762"
            y="255"
            width="16"
            height="42"
            rx="4"
            fill={isActive('BTN_TRIGGER_HAPPY4') ? ACCENT : '#282a36'}
            stroke="#45485d"
            strokeWidth="1.5"
            filter={isActive('BTN_TRIGGER_HAPPY4') ? 'url(#sd-glow)' : undefined}
          />
          <text x="770" y="280" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">R5</text>
        </g>
      </g>
    </svg>
  );
};

export default SteamDeckGamepad;
