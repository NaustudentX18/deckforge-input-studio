import React, { useState, useMemo } from 'react';
import { highlightVDF, validateVDF, diffVDF, formatVDF, VDFDiffLine } from '../utils/vdf';
import { VDFTemplate } from '../types';

interface VDFInspectorProps {
  currentVdfText: string;
  savedVdfText: string;
  onChangeVdfText?: (newVdf: string) => void;
  onRestoreDefaults?: () => void;
}

export const VDFInspector: React.FC<VDFInspectorProps> = ({
  currentVdfText,
  savedVdfText,
  onChangeVdfText,
  onRestoreDefaults,
}) => {
  const [isEditable, setIsEditable] = useState(false);
  const [activeTab, setActiveTab] = useState<'diff' | 'raw'>('diff');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Validation
  const validation = useMemo(() => validateVDF(currentVdfText), [currentVdfText]);

  // Diff
  const diffLines = useMemo(() => diffVDF(savedVdfText, currentVdfText), [savedVdfText, currentVdfText]);

  // Highlighted spans for raw viewer
  const highlightedTokens = useMemo(() => highlightVDF(currentVdfText), [currentVdfText]);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentVdfText);
    setCopyStatus('Copied to clipboard!');
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleFormat = () => {
    if (onChangeVdfText) {
      onChangeVdfText(formatVDF(currentVdfText));
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#161626',
      color: '#eee',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Top Toolbar */}
      <div style={{
        padding: '14px 16px',
        backgroundColor: '#1a1a2e',
        borderBottom: '1px solid #2d2d44',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        {/* Left Status & Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>VDF Inspector & Diff</span>

          {/* Validation Status Badge */}
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: validation.valid ? '#166534' : '#991b1b',
            color: '#fff',
            fontWeight: 600
          }}>
            {validation.valid ? '✓ Valid VDF' : `✕ ${validation.errors.length} Syntax Error(s)`}
          </span>

          <div style={{ display: 'flex', backgroundColor: '#121220', borderRadius: '4px', padding: '2px', border: '1px solid #2d2d44' }}>
            <button
              onClick={() => setActiveTab('diff')}
              style={{
                padding: '4px 10px',
                backgroundColor: activeTab === 'diff' ? '#e94560' : 'transparent',
                color: activeTab === 'diff' ? '#fff' : '#a0a0b8',
                border: 'none',
                borderRadius: '3px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Side-by-Side Diff
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              style={{
                padding: '4px 10px',
                backgroundColor: activeTab === 'raw' ? '#e94560' : 'transparent',
                color: activeTab === 'raw' ? '#fff' : '#a0a0b8',
                border: 'none',
                borderRadius: '3px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Syntax Viewer / Editor
            </button>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeTab === 'raw' && (
            <>
              <button
                onClick={() => setIsEditable(!isEditable)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: isEditable ? '#e94560' : '#27273a',
                  color: '#fff',
                  border: '1px solid #3f3f58',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {isEditable ? 'View Highlighted' : 'Edit Text'}
              </button>
              {isEditable && (
                <button
                  onClick={handleFormat}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#27273a',
                    color: '#eee',
                    border: '1px solid #3f3f58',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Format / Indent
                </button>
              )}
            </>
          )}

          <button
            onClick={handleCopy}
            style={{
              padding: '6px 12px',
              backgroundColor: '#27273a',
              color: '#eee',
              border: '1px solid #3f3f58',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {copyStatus || 'Copy VDF'}
          </button>

          {onRestoreDefaults && (
            <button
              onClick={() => {
                if (window.confirm('Restore defaults? All unsaved VDF changes will be lost.')) {
                  onRestoreDefaults();
                }
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#381c24',
                color: '#ff6b81',
                border: '1px solid #552230',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Restore Default
            </button>
          )}
        </div>
      </div>

      {/* Validation Error Banner */}
      {!validation.valid && (
        <div style={{
          backgroundColor: '#38141c',
          borderBottom: '1px solid #7f1d1d',
          padding: '8px 16px',
          fontSize: '12px',
          color: '#fca5a5'
        }}>
          <strong>Validation Errors:</strong>
          {validation.errors.slice(0, 3).map((err, idx) => (
            <div key={idx}>Line {err.line}, Col {err.column}: {err.message}</div>
          ))}
        </div>
      )}

      {/* Main Split / Diff View */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'diff' ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left Panel: Saved Version */}
            <div style={{
              flex: 1,
              borderRight: '1px solid #2d2d44',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '8px 16px',
                backgroundColor: '#121220',
                borderBottom: '1px solid #222235',
                fontSize: '12px',
                fontWeight: 600,
                color: '#888'
              }}>
                Original / Saved Version
              </div>
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                whiteSpace: 'pre',
                backgroundColor: '#0f0f1a'
              }}>
                {savedVdfText || '// No saved state available.'}
              </div>
            </div>

            {/* Right Panel: Current / Modified with Diff Highlighting */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{
                padding: '8px 16px',
                backgroundColor: '#121220',
                borderBottom: '1px solid #222235',
                fontSize: '12px',
                fontWeight: 600,
                color: '#60a5fa'
              }}>
                Active Working Template (Diff View)
              </div>
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                backgroundColor: '#0f0f1a'
              }}>
                {diffLines.map((line, idx) => {
                  let bgColor = 'transparent';
                  let textColor = '#cbd5e1';
                  let prefix = ' ';

                  if (line.type === 'added') {
                    bgColor = 'rgba(34, 197, 94, 0.15)';
                    textColor = '#4ade80';
                    prefix = '+';
                  } else if (line.type === 'removed') {
                    bgColor = 'rgba(239, 68, 68, 0.15)';
                    textColor = '#f87171';
                    prefix = '-';
                  } else if (line.type === 'changed') {
                    bgColor = 'rgba(234, 179, 8, 0.15)';
                    textColor = '#fde047';
                    prefix = '~';
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: bgColor,
                        color: textColor,
                        padding: '1px 4px',
                        borderRadius: '2px',
                        display: 'flex'
                      }}
                    >
                      <span style={{ width: '32px', color: '#555', userSelect: 'none' }}>
                        {line.lineNumber}
                      </span>
                      <span style={{ width: '16px', fontWeight: 700, userSelect: 'none' }}>
                        {prefix}
                      </span>
                      <span style={{ whiteSpace: 'pre' }}>{line.content}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Raw Syntax Highlighted or Editable View */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {isEditable ? (
              <textarea
                value={currentVdfText}
                onChange={(e) => onChangeVdfText?.(e.target.value)}
                style={{
                  flex: 1,
                  padding: '16px',
                  backgroundColor: '#0f0f1a',
                  color: '#fff',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'JetBrains Mono, Menlo, monospace',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  resize: 'none'
                }}
              />
            ) : (
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                whiteSpace: 'pre',
                backgroundColor: '#0f0f1a'
              }}>
                {highlightedTokens.map((span, idx) => {
                  let color = '#eee';
                  if (span.className === 'vdf-key') color = '#60a5fa'; // blue
                  else if (span.className === 'vdf-value') color = '#34d399'; // green
                  else if (span.className === 'vdf-brace') color = '#f472b6'; // pink
                  else if (span.className === 'vdf-comment') color = '#6b7280'; // gray

                  return (
                    <span key={idx} style={{ color }}>
                      {span.text}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
