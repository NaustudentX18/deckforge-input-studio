import React, { useMemo } from 'react';

interface BlankCanvasProps {
  activeInputs: Map<string, number>;
  selectedInput: string | null;
  onSelectInput: (code: string) => void;
  scale?: number;
  capabilities?: {
    buttons?: string[];
    axes?: string[];
  };
  deviceName?: string;
}

const ACCENT = '#e94560';

// Default fallback capabilities if none are provided
const DEFAULT_BUTTONS = Array.from({ length: 32 }, (_, i) => `BTN_${i}`);
const DEFAULT_AXES = [
  'ABS_X',
  'ABS_Y',
  'ABS_Z',
  'ABS_RX',
  'ABS_RY',
  'ABS_RZ',
  'ABS_HAT0X',
  'ABS_HAT0Y',
];

export const BlankCanvas: React.FC<BlankCanvasProps> = ({
  activeInputs,
  selectedInput,
  onSelectInput,
  scale = 1,
  capabilities,
  deviceName = 'Generic HID Device',
}) => {
  const buttons = capabilities?.buttons && capabilities.buttons.length > 0
    ? capabilities.buttons
    : DEFAULT_BUTTONS;

  const axes = capabilities?.axes && capabilities.axes.length > 0
    ? capabilities.axes
    : DEFAULT_AXES;

  const isActive = (code: string) => (activeInputs.get(code) ?? 0) > 0;
  const getValue = (code: string) => activeInputs.get(code) ?? 0;
  const isSelected = (code: string) => selectedInput === code;

  // Layout parameters
  const padX = 35;
  const padY = 35;
  const titleHeight = 45;

  // Button grid layout: rows of 8
  const cols = 8;
  const btnW = 76;
  const btnH = 34;
  const btnGapX = 10;
  const btnGapY = 10;
  const btnRows = Math.ceil(buttons.length / cols);
  const buttonGridWidth = cols * btnW + (cols - 1) * btnGapX;
  const buttonGridHeight = btnRows * btnH + (btnRows - 1) * btnGapY;

  // Axis layout: slider bars in rows (up to 8 per row)
  const axisCols = Math.min(8, Math.max(1, axes.length));
  const axisW = 76;
  const axisH = 110;
  const axisGapX = 10;
  const axisGapY = 15;
  const axisRows = Math.ceil(axes.length / axisCols);
  const axisSectionWidth = axisCols * axisW + (axisCols - 1) * axisGapX;
  const axisSectionHeight = axisRows * axisH + (axisRows - 1) * axisGapY;

  const contentWidth = Math.max(buttonGridWidth, axisSectionWidth);
  const totalWidth = contentWidth + padX * 2;
  const totalHeight = padY + titleHeight + buttonGridHeight + (axes.length > 0 ? 35 + axisSectionHeight : 0) + padY;

  const svgStyle = useMemo(
    () => ({ width: totalWidth * scale, height: totalHeight * scale }),
    [totalWidth, totalHeight, scale],
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
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      style={svgStyle}
      xmlns="http://www.w3.org/2000/svg"
      className="deckforge-blank-canvas"
    >
      <defs>
        <filter id="bc-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="bc-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <linearGradient id="bc-chassis-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#252735" />
          <stop offset="100%" stopColor="#171822" />
        </linearGradient>
        <linearGradient id="bc-axis-track" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1c25" />
          <stop offset="100%" stopColor="#12131a" />
        </linearGradient>
      </defs>

      {/* Main Enclosure */}
      <rect
        x="10"
        y="10"
        width={totalWidth - 20}
        height={totalHeight - 20}
        rx="14"
        fill="url(#bc-chassis-grad)"
        stroke="#3b3e52"
        strokeWidth="2"
        filter="url(#bc-shadow)"
      />

      {/* Device Header */}
      <text x={padX} y={padY + 16} fill="#f1f2f6" fontSize="14" fontWeight="bold">
        {deviceName}
      </text>
      <text x={padX} y={padY + 30} fill="#7e8299" fontSize="9">
        AUTO-GENERATED HID BLUEPRINT • {buttons.length} BUTTONS • {axes.length} AXES
      </text>

      {/* Button Matrix Section */}
      <g id="button-matrix">
        <text
          x={padX}
          y={padY + titleHeight - 4}
          fill="#a1a5b7"
          fontSize="10"
          fontWeight="bold"
          letterSpacing="1"
        >
          DIGITAL BUTTONS
        </text>

        {buttons.map((code, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = padX + col * (btnW + btnGapX);
          const y = padY + titleHeight + row * (btnH + btnGapY);
          const active = isActive(code);
          const selected = isSelected(code);

          // Pretty display label (strip BTN_ if too long or keep clean)
          const displayLabel = code.replace(/^BTN_/, '');

          return (
            <g
              key={code}
              data-input-code={code}
              onClick={() => onSelectInput(code)}
              style={{ cursor: 'pointer' }}
            >
              {selected && renderHighlightRect(x, y, btnW, btnH, 5)}
              <rect
                x={x}
                y={y}
                width={btnW}
                height={btnH}
                rx="5"
                fill={active ? ACCENT : '#2b2d3d'}
                stroke={active ? '#ffffff' : '#3f4257'}
                strokeWidth={active ? 2 : 1}
                filter={active ? 'url(#bc-glow)' : undefined}
              />
              {/* Button text */}
              <text
                x={x + btnW / 2}
                y={y + btnH / 2 + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={active ? '#ffffff' : '#e4e6ef'}
                fontSize="9"
                fontWeight="bold"
                pointerEvents="none"
              >
                {displayLabel}
              </text>
            </g>
          );
        })}
      </g>

      {/* Axis Section */}
      {axes.length > 0 && (
        <g id="axis-section" transform={`translate(0, ${padY + titleHeight + buttonGridHeight + 25})`}>
          <text
            x={padX}
            y="-4"
            fill="#a1a5b7"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="1"
          >
            ANALOG AXES & SLIDERS
          </text>

          {axes.map((code, index) => {
            const col = index % axisCols;
            const row = Math.floor(index / axisCols);
            const x = padX + col * (axisW + axisGapX);
            const y = row * (axisH + axisGapY);
            const rawVal = getValue(code);
            const active = isActive(code) || Math.abs(rawVal) > 0.02;
            const selected = isSelected(code);

            // Normalized -1..1 or 0..1 to percentage 0..1
            // Evdev axes are often -32768..32767 or 0..255.
            let norm = 0.5;
            if (Math.abs(rawVal) > 1) {
              if (rawVal < 0) {
                norm = Math.max(0, Math.min(1, (rawVal + 32768) / 65535));
              } else if (rawVal <= 255) {
                norm = rawVal / 255;
              } else {
                norm = Math.max(0, Math.min(1, (rawVal + 32768) / 65535));
              }
            } else {
              norm = (rawVal + 1) / 2; // -1..1 -> 0..1
            }

            const trackH = 50;
            const trackW = 14;
            const trackX = x + (axisW - trackW) / 2;
            const trackY = y + 14;
            const fillHeight = Math.max(3, norm * trackH);
            const fillY = trackY + (trackH - fillHeight);

            return (
              <g
                key={code}
                data-input-code={code}
                onClick={() => onSelectInput(code)}
                style={{ cursor: 'pointer' }}
              >
                {selected && renderHighlightRect(x, y, axisW, axisH - 10, 5)}
                {/* Background card */}
                <rect
                  x={x}
                  y={y}
                  width={axisW}
                  height={axisH - 10}
                  rx="5"
                  fill="#21222e"
                  stroke="#333647"
                  strokeWidth="1"
                />

                {/* Slider Track */}
                <rect
                  x={trackX}
                  y={trackY}
                  width={trackW}
                  height={trackH}
                  rx="4"
                  fill="url(#bc-axis-track)"
                  stroke="#3c3f54"
                  strokeWidth="1"
                />

                {/* Center Zero Line */}
                <line
                  x1={trackX - 2}
                  y1={trackY + trackH / 2}
                  x2={trackX + trackW + 2}
                  y2={trackY + trackH / 2}
                  stroke="#585c74"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />

                {/* Active Level Fill */}
                <rect
                  x={trackX + 2}
                  y={fillY}
                  width={trackW - 4}
                  height={fillHeight}
                  rx="2"
                  fill={active ? ACCENT : '#585c74'}
                  filter={active ? 'url(#bc-glow)' : undefined}
                />

                {/* Axis Code Label */}
                <text
                  x={x + axisW / 2}
                  y={trackY + trackH + 13}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="8"
                  fontWeight="bold"
                >
                  {code.replace(/^ABS_/, '')}
                </text>

                {/* Value readout */}
                <text
                  x={x + axisW / 2}
                  y={trackY + trackH + 24}
                  textAnchor="middle"
                  fill="#7e8299"
                  fontSize="7"
                >
                  {typeof rawVal === 'number' ? (Math.abs(rawVal) > 1 ? rawVal : rawVal.toFixed(2)) : '0'}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
};

export default BlankCanvas;
