import React, { useState, useEffect, useRef } from 'react';
import { InputEvent } from '../types';

interface InputMonitorProps {
  lastEvent: InputEvent | null;
  activeDeviceName?: string;
  connectionState: string;
}

interface DisplayEvent extends InputEvent {
  id: string;
  normalizedValue: number;
}

export const InputMonitor: React.FC<InputMonitorProps> = ({
  lastEvent,
  activeDeviceName,
  connectionState,
}) => {
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filterButton, setFilterButton] = useState(true);
  const [filterAxis, setFilterAxis] = useState(true);
  const [filterHat, setFilterHat] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Normalize event value
  const normalizeValue = (evt: InputEvent): number => {
    if (evt.type === 'EV_KEY') return evt.value === 0 ? 0 : 1;
    if (evt.type === 'EV_ABS') {
      // 16-bit signed or unsigned mapping to -1.0 .. 1.0 or 0.0 .. 1.0
      if (evt.value < 0) return Math.max(-1, evt.value / 32768);
      return Math.min(1, evt.value / 32767);
    }
    return evt.value;
  };

  useEffect(() => {
    if (!lastEvent || isPaused) return;

    const displayEvt: DisplayEvent = {
      ...lastEvent,
      id: `${lastEvent.timestamp}_${Math.random()}`,
      normalizedValue: normalizeValue(lastEvent),
    };

    setEvents((prev) => {
      const next = [displayEvt, ...prev];
      if (next.length > 200) {
        return next.slice(0, 200);
      }
      return next;
    });
  }, [lastEvent, isPaused]);

  const filteredEvents = events.filter((e) => {
    const isHat = e.codeLabel?.includes('HAT') || (e.code >= 16 && e.code <= 19);
    if (isHat) return filterHat;
    if (e.type === 'EV_KEY') return filterButton;
    if (e.type === 'EV_ABS' || e.type === 'EV_REL') return filterAxis;
    return true;
  });

  const getEventBadgeColor = (e: DisplayEvent) => {
    const isHat = e.codeLabel?.includes('HAT') || (e.code >= 16 && e.code <= 19);
    if (isHat) return { bg: '#d97706', text: '#fff' }; // orange
    if (e.type === 'EV_KEY') return { bg: '#2563eb', text: '#fff' }; // blue
    return { bg: '#16a34a', text: '#fff' }; // green for axis
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#161626',
      borderRadius: '8px',
      border: '1px solid #2d2d44',
      overflow: 'hidden',
      color: '#eee',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Header & Controls Toolbar */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#1a1a2e',
        borderBottom: '1px solid #2d2d44',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Input Monitor</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            backgroundColor: connectionState === 'connected' ? '#166534' : '#991b1b',
            color: '#fff'
          }}>
            {activeDeviceName ? `${activeDeviceName} (${connectionState})` : connectionState}
          </span>
          <span style={{ fontSize: '12px', color: '#888' }}>
            Buffer: {events.length}/200
          </span>
        </div>

        {/* Filter Checkboxes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#60a5fa' }}>
            <input
              type="checkbox"
              checked={filterButton}
              onChange={(e) => setFilterButton(e.target.checked)}
              style={{ accentColor: '#2563eb' }}
            />
            Buttons
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#4ade80' }}>
            <input
              type="checkbox"
              checked={filterAxis}
              onChange={(e) => setFilterAxis(e.target.checked)}
              style={{ accentColor: '#16a34a' }}
            />
            Axes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#fbbf24' }}>
            <input
              type="checkbox"
              checked={filterHat}
              onChange={(e) => setFilterHat(e.target.checked)}
              style={{ accentColor: '#d97706' }}
            />
            Hats
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsPaused(!isPaused)}
            style={{
              padding: '6px 14px',
              backgroundColor: isPaused ? '#e94560' : '#2d2d44',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={() => setEvents([])}
            style={{
              padding: '6px 14px',
              backgroundColor: '#2d2d44',
              color: '#bbb',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table Column Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 140px 100px 90px 110px 1fr',
        padding: '8px 16px',
        backgroundColor: '#121220',
        borderBottom: '1px solid #222235',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#71717a'
      }}>
        <span>Type</span>
        <span>Code / Identifier</span>
        <span>Raw Value</span>
        <span>Normalized</span>
        <span>Timestamp</span>
        <span>Visual</span>
      </div>

      {/* Events List */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          fontSize: '13px'
        }}
      >
        {filteredEvents.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            {isPaused ? 'Monitor is paused.' : 'Waiting for incoming input events...'}
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const colors = getEventBadgeColor(evt);
            const timeStr = typeof evt.timestamp === 'number'
              ? evt.timestamp.toFixed(3)
              : String(evt.timestamp);

            return (
              <div
                key={evt.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 140px 100px 90px 110px 1fr',
                  padding: '7px 16px',
                  borderBottom: '1px solid #1e1e30',
                  alignItems: 'center',
                  fontFamily: 'JetBrains Mono, Menlo, monospace',
                  backgroundColor: 'transparent'
                }}
              >
                <span>
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: colors.bg,
                    color: colors.text,
                    fontWeight: 600
                  }}>
                    {evt.type}
                  </span>
                </span>
                <span style={{ color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {evt.codeLabel || `CODE_${evt.code}`}
                </span>
                <span style={{ color: '#cbd5e1' }}>{evt.value}</span>
                <span style={{ color: '#93c5fd' }}>{evt.normalizedValue.toFixed(2)}</span>
                <span style={{ color: '#64748b', fontSize: '11px' }}>{timeStr}s</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    flex: 1,
                    height: '6px',
                    backgroundColor: '#27273a',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    maxWidth: '140px'
                  }}>
                    <div style={{
                      width: `${Math.abs(evt.normalizedValue) * 100}%`,
                      height: '100%',
                      backgroundColor: evt.type === 'EV_KEY' ? '#3b82f6' : '#22c55e',
                      transition: 'width 0.05s ease'
                    }} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
