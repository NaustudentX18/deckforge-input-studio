import React, { useState, useEffect, useRef } from 'react';
import { LatencyResult, PollingRateResult, InputEvent } from '../types';

interface LatencyTesterProps {
  lastEvent: InputEvent | null;
  devicePath?: string;
}

export const LatencyTester: React.FC<LatencyTesterProps> = ({ lastEvent, devicePath }) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);

  // Polling rates & timing
  const [currentHz, setCurrentHz] = useState<number>(0);
  const [hzHistory, setHzHistory] = useState<number[]>([]);
  const [jitterMs, setJitterMs] = useState<number>(0);
  const [minLatencyUs, setMinLatencyUs] = useState<number>(999999);
  const [maxLatencyUs, setMaxLatencyUs] = useState<number>(0);
  const [avgLatencyUs, setAvgLatencyUs] = useState<number>(0);
  const [totalSamples, setTotalSamples] = useState<number>(0);

  // Interval histogram for button debounce/bounce analysis (bins: <2ms, 2-5ms, 5-10ms, 10-20ms, >20ms)
  const [bounceBins, setBounceBins] = useState<number[]>([0, 0, 0, 0, 0]);

  const eventTimesRef = useRef<number[]>([]);
  const lastEventTimestampRef = useRef<number>(0);
  const samplesCountRef = useRef<number>(0);
  const sumLatencyRef = useRef<number>(0);

  // Test timer
  useEffect(() => {
    let interval: any;
    if (isRunning) {
      interval = setInterval(() => {
        setDurationSeconds((s) => s + 1);

        // Calculate Hz over the last second
        const now = performance.now();
        const oneSecAgo = now - 1000;
        const recent = eventTimesRef.current.filter((t) => t > oneSecAgo);
        const hz = recent.length;
        setCurrentHz(hz);
        setHzHistory((prev) => [...prev.slice(-30), hz]);

        // Jitter computation (std deviation of delta intervals)
        if (recent.length > 2) {
          const intervals: number[] = [];
          for (let i = 1; i < recent.length; i++) {
            intervals.push(recent[i] - recent[i - 1]);
          }
          const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
          setJitterMs(Math.sqrt(variance));
        }

        // Clean up old timestamps
        eventTimesRef.current = recent;
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  // Handle incoming event
  useEffect(() => {
    if (!isRunning || !lastEvent) return;

    const now = performance.now();
    eventTimesRef.current.push(now);
    samplesCountRef.current += 1;
    setTotalSamples(samplesCountRef.current);

    // Delta / Latency calculation
    if (lastEventTimestampRef.current > 0) {
      const deltaMs = now - lastEventTimestampRef.current;
      const deltaUs = Math.round(deltaMs * 1000);

      // Bounce binning
      if (deltaMs < 2) setBounceBins((b) => [b[0] + 1, b[1], b[2], b[3], b[4]]);
      else if (deltaMs < 5) setBounceBins((b) => [b[0], b[1] + 1, b[2], b[3], b[4]]);
      else if (deltaMs < 10) setBounceBins((b) => [b[0], b[1], b[2] + 1, b[3], b[4]]);
      else if (deltaMs < 20) setBounceBins((b) => [b[0], b[1], b[2], b[3] + 1, b[4]]);
      else setBounceBins((b) => [b[0], b[1], b[2], b[3], b[4] + 1]);

      setMinLatencyUs((m) => Math.min(m, deltaUs));
      setMaxLatencyUs((m) => Math.max(m, deltaUs));
      sumLatencyRef.current += deltaUs;
      setAvgLatencyUs(Math.round(sumLatencyRef.current / samplesCountRef.current));
    }

    lastEventTimestampRef.current = now;
  }, [isRunning, lastEvent]);

  const handleStartStop = () => {
    if (!isRunning) {
      // Reset
      eventTimesRef.current = [];
      lastEventTimestampRef.current = 0;
      samplesCountRef.current = 0;
      sumLatencyRef.current = 0;
      setDurationSeconds(0);
      setCurrentHz(0);
      setHzHistory([]);
      setJitterMs(0);
      setMinLatencyUs(999999);
      setMaxLatencyUs(0);
      setAvgLatencyUs(0);
      setTotalSamples(0);
      setBounceBins([0, 0, 0, 0, 0]);
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  };

  const handleExport = () => {
    const report = {
      devicePath,
      durationSeconds,
      totalSamples,
      currentHz,
      jitterMs,
      minLatencyUs,
      maxLatencyUs,
      avgLatencyUs,
      bounceBins: {
        under2ms: bounceBins[0],
        twoTo5ms: bounceBins[1],
        fiveTo10ms: bounceBins[2],
        tenTo20ms: bounceBins[3],
        over20ms: bounceBins[4],
      },
      exportedAt: new Date().toISOString(),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `deckforge-latency-${Date.now()}.json`;
    a.click();
    a.remove();
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#161626',
      color: '#eee',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflowY: 'auto'
    }}>
      {/* Top Header */}
      <div style={{
        padding: '16px',
        backgroundColor: '#1a1a2e',
        borderBottom: '1px solid #2d2d44',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Latency & Polling Diagnostics</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: isRunning ? '#166534' : '#27273a',
            color: '#fff',
            fontWeight: 600
          }}>
            {isRunning ? `Testing (${durationSeconds}s)` : 'Idle'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleStartStop}
            style={{
              padding: '6px 16px',
              backgroundColor: isRunning ? '#ef4444' : '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isRunning ? '■ Stop Test' : '▶ Start Test'}
          </button>
          <button
            onClick={handleExport}
            disabled={totalSamples === 0}
            style={{
              padding: '6px 14px',
              backgroundColor: '#27273a',
              color: '#eee',
              border: '1px solid #3f3f58',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: totalSamples === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div style={{ backgroundColor: '#1a1a2e', padding: '16px', borderRadius: '8px', border: '1px solid #2d2d44' }}>
            <div style={{ fontSize: '11px', color: '#a0a0b8', textTransform: 'uppercase' }}>Polling Rate</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#60a5fa', margin: '4px 0' }}>
              {currentHz} <span style={{ fontSize: '14px', fontWeight: 400 }}>Hz</span>
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>Updates / second</div>
          </div>

          <div style={{ backgroundColor: '#1a1a2e', padding: '16px', borderRadius: '8px', border: '1px solid #2d2d44' }}>
            <div style={{ fontSize: '11px', color: '#a0a0b8', textTransform: 'uppercase' }}>Jitter (Std Dev)</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b', margin: '4px 0' }}>
              {jitterMs.toFixed(2)} <span style={{ fontSize: '14px', fontWeight: 400 }}>ms</span>
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>Interval variance</div>
          </div>

          <div style={{ backgroundColor: '#1a1a2e', padding: '16px', borderRadius: '8px', border: '1px solid #2d2d44' }}>
            <div style={{ fontSize: '11px', color: '#a0a0b8', textTransform: 'uppercase' }}>Avg Interval</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#34d399', margin: '4px 0' }}>
              {(avgLatencyUs / 1000).toFixed(2)} <span style={{ fontSize: '14px', fontWeight: 400 }}>ms</span>
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>Min: {minLatencyUs === 999999 ? 0 : (minLatencyUs / 1000).toFixed(2)}ms</div>
          </div>

          <div style={{ backgroundColor: '#1a1a2e', padding: '16px', borderRadius: '8px', border: '1px solid #2d2d44' }}>
            <div style={{ fontSize: '11px', color: '#a0a0b8', textTransform: 'uppercase' }}>Total Samples</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#e94560', margin: '4px 0' }}>
              {totalSamples}
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>Max: {(maxLatencyUs / 1000).toFixed(2)}ms</div>
          </div>
        </div>

        {/* Polling Rate Sparkline Graph */}
        <div style={{ backgroundColor: '#1a1a2e', padding: '16px', borderRadius: '8px', border: '1px solid #2d2d44' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#fff' }}>Polling Rate History (Last 30 Seconds)</h4>
          <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end', gap: '4px', backgroundColor: '#10101d', padding: '8px', borderRadius: '4px' }}>
            {hzHistory.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#555', fontSize: '12px', alignSelf: 'center' }}>
                Start the test to stream polling rate history
              </div>
            ) : (
              hzHistory.map((hz, idx) => {
                const heightPercent = Math.min(100, (hz / 1000) * 100);
                return (
                  <div
                    key={idx}
                    title={`${hz} Hz`}
                    style={{
                      flex: 1,
                      height: `${Math.max(6, heightPercent)}%`,
                      backgroundColor: '#3b82f6',
                      borderRadius: '2px 2px 0 0',
                      transition: 'height 0.2s ease'
                    }}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Button Bounce Interval Histogram */}
        <div style={{ backgroundColor: '#1a1a2e', padding: '16px', borderRadius: '8px', border: '1px solid #2d2d44' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#fff' }}>Input Bounce & Chattering Distribution</h4>
          <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888' }}>
            Events separated by less than 5ms indicate potential mechanical contact bounce and should be filtered using the debounce slider.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: '< 2 ms (Chatter / Bounce)', count: bounceBins[0], color: '#ef4444' },
              { label: '2 - 5 ms (Fast mechanical)', count: bounceBins[1], color: '#f59e0b' },
              { label: '5 - 10 ms (Normal fast tap)', count: bounceBins[2], color: '#3b82f6' },
              { label: '10 - 20 ms (Standard press)', count: bounceBins[3], color: '#10b981' },
              { label: '> 20 ms (Distinct press)', count: bounceBins[4], color: '#6366f1' },
            ].map((bin, i) => {
              const maxCount = Math.max(1, ...bounceBins);
              const barPercent = (bin.count / maxCount) * 100;

              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 50px', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#a0a0b8' }}>{bin.label}</span>
                  <div style={{ height: '10px', backgroundColor: '#10101d', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barPercent}%`,
                      height: '100%',
                      backgroundColor: bin.color,
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: '12px', color: '#eee', textAlign: 'right', fontFamily: 'monospace' }}>
                    {bin.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
