import React, { useState } from 'react';
import { ActionSet, ActionSetLayer, LayerActivationTrigger } from '../types';

interface ActionLayerEditorProps {
  actionSets: ActionSet[];
  activeSetId: string;
  activeLayerId: string;
  onSelectSet: (setId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onAddSet: (name: string) => void;
  onRenameSet: (setId: string, newName: string) => void;
  onDeleteSet: (setId: string) => void;
  onAddLayer: (setId: string, layerName: string) => void;
  onRenameLayer: (setId: string, layerId: string, newName: string) => void;
  onDeleteLayer: (setId: string, layerId: string) => void;
  onCopyLayerBindings: (setId: string, sourceLayerId: string, targetLayerId: string) => void;
  onUpdateLayerActivation?: (setId: string, layerId: string, trigger: LayerActivationTrigger) => void;
}

export const ActionLayerEditor: React.FC<ActionLayerEditorProps> = ({
  actionSets,
  activeSetId,
  activeLayerId,
  onSelectSet,
  onSelectLayer,
  onAddSet,
  onRenameSet,
  onDeleteSet,
  onAddLayer,
  onRenameLayer,
  onDeleteLayer,
  onCopyLayerBindings,
}) => {
  const [newSetName, setNewSetName] = useState('');
  const [newLayerName, setNewLayerName] = useState('');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Copy layer modal state
  const [copySourceLayerId, setCopySourceLayerId] = useState<string>('');
  const [copyTargetLayerId, setCopyTargetLayerId] = useState<string>('');
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);

  // Active set
  const currentSet = actionSets.find((s) => s.id === activeSetId) || actionSets[0];

  const handleCreateSet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;
    onAddSet(newSetName.trim());
    setNewSetName('');
  };

  const handleCreateLayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLayerName.trim() || !currentSet) return;
    onAddLayer(currentSet.id, newLayerName.trim());
    setNewLayerName('');
  };

  const handleExecuteCopy = () => {
    if (currentSet && copySourceLayerId && copyTargetLayerId) {
      onCopyLayerBindings(currentSet.id, copySourceLayerId, copyTargetLayerId);
      setIsCopyModalOpen(false);
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
      {/* Top Bar / Set Selector */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: '#a0a0b8' }}>
            Action Sets:
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {actionSets.map((set) => {
              const isSelected = set.id === currentSet?.id;
              return (
                <div key={set.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: isSelected ? '#e94560' : '#222238', borderRadius: '6px' }}>
                  {editingSetId === set.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => {
                        onRenameSet(set.id, editName);
                        setEditingSetId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onRenameSet(set.id, editName);
                          setEditingSetId(null);
                        }
                      }}
                      autoFocus
                      style={{
                        padding: '6px 8px',
                        backgroundColor: '#121220',
                        color: '#fff',
                        border: '1px solid #fff',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => onSelectSet(set.id)}
                      onDoubleClick={() => {
                        setEditingSetId(set.id);
                        setEditName(set.name);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        color: isSelected ? '#fff' : '#ccc',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {set.name}
                    </button>
                  )}
                  {actionSets.length > 1 && (
                    <button
                      onClick={() => onDeleteSet(set.id)}
                      title="Delete Set"
                      style={{
                        backgroundColor: 'transparent',
                        color: isSelected ? '#ffd0d6' : '#888',
                        border: 'none',
                        padding: '4px 6px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Set Inline Form */}
        <form onSubmit={handleCreateSet} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            placeholder="New set name..."
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            style={{
              padding: '6px 10px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '4px',
              color: '#eee',
              fontSize: '12px'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '6px 12px',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Set
          </button>
        </form>
      </div>

      {/* Main Layers Section */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>
              Action Layers for "{currentSet?.name || 'Default'}"
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
              Layers overlay bindings on top of base action sets when triggered by holds, toggles, or combinations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                if (currentSet?.layers && currentSet.layers.length >= 2) {
                  setCopySourceLayerId(currentSet.layers[0].id);
                  setCopyTargetLayerId(currentSet.layers[1].id);
                  setIsCopyModalOpen(true);
                } else {
                  alert('You need at least 2 layers to copy bindings.');
                }
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#27273a',
                color: '#eee',
                border: '1px solid #3d3d54',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Copy Bindings
            </button>
          </div>
        </div>

        {/* Copy Modal */}
        {isCopyModalOpen && currentSet && (
          <div style={{
            backgroundColor: '#1d1d33',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px',
            maxWidth: '500px'
          }}>
            <h4 style={{ margin: '0 0 12px', color: '#fff', fontSize: '14px' }}>Copy Bindings Between Layers</h4>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px' }}>From Layer:</label>
                <select
                  value={copySourceLayerId}
                  onChange={(e) => setCopySourceLayerId(e.target.value)}
                  style={{ padding: '6px 10px', backgroundColor: '#121220', border: '1px solid #33334d', color: '#eee', borderRadius: '4px' }}
                >
                  {currentSet.layers.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <span style={{ color: '#888', marginTop: '16px' }}>➔</span>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px' }}>To Layer:</label>
                <select
                  value={copyTargetLayerId}
                  onChange={(e) => setCopyTargetLayerId(e.target.value)}
                  style={{ padding: '6px 10px', backgroundColor: '#121220', border: '1px solid #33334d', color: '#eee', borderRadius: '4px' }}
                >
                  {currentSet.layers.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleExecuteCopy}
                style={{ padding: '6px 14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Copy Now
              </button>
              <button
                onClick={() => setIsCopyModalOpen(false)}
                style={{ padding: '6px 14px', backgroundColor: '#2d2d44', color: '#bbb', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Layer Stack View */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {currentSet?.layers.map((layer, index) => {
            const isSelected = layer.id === activeLayerId;
            const isBase = index === 0;

            return (
              <div
                key={layer.id}
                style={{
                  backgroundColor: isSelected ? '#1e1e36' : '#141424',
                  border: `1px solid ${isSelected ? '#e94560' : '#27273a'}`,
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: isSelected ? '0 0 10px rgba(233, 69, 96, 0.2)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: isBase ? '#2563eb' : '#e94560',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                    {index}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {editingLayerId === layer.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => {
                            if (currentSet) onRenameLayer(currentSet.id, layer.id, editName);
                            setEditingLayerId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (currentSet) onRenameLayer(currentSet.id, layer.id, editName);
                              setEditingLayerId(null);
                            }
                          }}
                          autoFocus
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#121220',
                            color: '#fff',
                            border: '1px solid #fff',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => {
                            setEditingLayerId(layer.id);
                            setEditName(layer.name);
                          }}
                          style={{ fontSize: '15px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                        >
                          {layer.name} {isBase ? '(Base Layer)' : ''}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: '#888' }}>
                        ({layer.bindings?.length || 0} active bindings)
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                      {isBase
                        ? 'Base layer: active by default when set is enabled'
                        : 'Trigger: Hold Left Bumper or Activator rule'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => onSelectLayer(layer.id)}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: isSelected ? '#e94560' : '#27273a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {isSelected ? 'Editing' : 'Select'}
                  </button>

                  {!isBase && (
                    <button
                      onClick={() => {
                        if (currentSet && window.confirm(`Delete layer "${layer.name}"?`)) {
                          onDeleteLayer(currentSet.id, layer.id);
                        }
                      }}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#381c24',
                        color: '#ff6b81',
                        border: '1px solid #552230',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Layer Section */}
        <div style={{ marginTop: '24px' }}>
          <form onSubmit={handleCreateLayer} style={{ display: 'flex', gap: '8px', maxWidth: '380px' }}>
            <input
              type="text"
              placeholder="New layer name (e.g. Combat, Driving)..."
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#121220',
                border: '1px solid #33334d',
                borderRadius: '6px',
                color: '#eee',
                fontSize: '13px'
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                backgroundColor: '#e94560',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + Add Layer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
