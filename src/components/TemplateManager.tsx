import React, { useState, useRef } from 'react';
import { VDFTemplate, SteamGame } from '../types';

interface TemplateManagerProps {
  templates: VDFTemplate[];
  categorized: {
    base: VDFTemplate[];
    user: VDFTemplate[];
    local: VDFTemplate[];
  };
  activeTemplate: VDFTemplate | null;
  games: SteamGame[];
  onSelectTemplate: (name: string) => void;
  onSaveTemplate: (template: VDFTemplate) => Promise<boolean>;
  onCloneTemplate: (template: VDFTemplate, newName: string) => Promise<boolean>;
  onDeleteTemplate: (name: string) => Promise<boolean>;
  onExportTemplate: (template: VDFTemplate) => void;
  onImportTemplate: (file: File) => Promise<boolean>;
  onAssignGame: (appId: number, templateName: string) => Promise<boolean>;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  categorized,
  activeTemplate,
  games,
  onSelectTemplate,
  onSaveTemplate,
  onCloneTemplate,
  onDeleteTemplate,
  onExportTemplate,
  onImportTemplate,
  onAssignGame,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'base' | 'user' | 'local'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newControllerType, setNewControllerType] = useState('steam_deck');

  // Assignment Modal/Panel
  const [selectedGameAppId, setSelectedGameAppId] = useState<number>(games[0]?.appId || 0);
  const [assigningTemplateName, setAssigningTemplateName] = useState<string | null>(null);
  const [assignStatus, setAssignStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newTemplate: VDFTemplate = {
      metadata: {
        name: newName.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
        title: newTitle || newName,
        description: newDesc,
        author: 'DeckForge User',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        deviceBlueprintId: newControllerType,
        tags: ['user', newControllerType],
      },
      actionSets: [
        {
          id: 'default_set',
          name: 'Default',
          bindings: [],
          layers: [],
        },
      ],
      virtualMenus: [],
      macros: [],
      axisCalibrations: [],
      turboConfigs: {},
    };

    const success = await onSaveTemplate(newTemplate);
    if (success) {
      setIsCreating(false);
      setNewName('');
      setNewTitle('');
      setNewDesc('');
      onSelectTemplate(newTemplate.metadata.name);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onImportTemplate(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAssignSubmit = async () => {
    if (!assigningTemplateName || !selectedGameAppId) return;
    const ok = await onAssignGame(selectedGameAppId, assigningTemplateName);
    if (ok) {
      setAssignStatus(`Assigned ${assigningTemplateName} successfully!`);
      setTimeout(() => {
        setAssignStatus(null);
        setAssigningTemplateName(null);
      }, 2000);
    } else {
      setAssignStatus('Failed to assign template.');
    }
  };

  const filterList = (list: VDFTemplate[]) => {
    return list.filter((t) => {
      const q = searchQuery.toLowerCase();
      return (
        t.metadata.name.toLowerCase().includes(q) ||
        t.metadata.title?.toLowerCase().includes(q) ||
        t.metadata.description?.toLowerCase().includes(q) ||
        t.metadata.deviceBlueprintId?.toLowerCase().includes(q)
      );
    });
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
      {/* Top Header Controls */}
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
        {/* Search & Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              backgroundColor: '#121220',
              border: '1px solid #33334d',
              borderRadius: '6px',
              color: '#eee',
              fontSize: '13px',
              width: '260px'
            }}
          />
          <div style={{ display: 'flex', backgroundColor: '#121220', borderRadius: '6px', padding: '2px', border: '1px solid #2a2a3e' }}>
            {(['all', 'base', 'user', 'local'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: selectedCategory === cat ? '#e94560' : 'transparent',
                  color: selectedCategory === cat ? '#fff' : '#a0a0b0',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".vdf,.json"
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '8px 14px',
              backgroundColor: '#27273a',
              color: '#eee',
              border: '1px solid #3f3f58',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Import File
          </button>
          <button
            onClick={() => setIsCreating(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + New Template
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* Create Template Form Modal */}
        {isCreating && (
          <div style={{
            backgroundColor: '#1f1f33',
            border: '1px solid #e94560',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
            maxWidth: '600px'
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#fff', fontSize: '16px' }}>Create New VDF Template</h3>
            <form onSubmit={handleCreateNew} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>System Identifier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. clone_hero_custom"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#141422',
                    border: '1px solid #33334d',
                    borderRadius: '4px',
                    color: '#eee'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Display Title</label>
                <input
                  type="text"
                  placeholder="e.g. Clone Hero Pro Layout"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#141422',
                    border: '1px solid #33334d',
                    borderRadius: '4px',
                    color: '#eee'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Controller Target Type</label>
                <select
                  value={newControllerType}
                  onChange={(e) => setNewControllerType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#141422',
                    border: '1px solid #33334d',
                    borderRadius: '4px',
                    color: '#eee'
                  }}
                >
                  <option value="steam_deck">Steam Deck (Neptune)</option>
                  <option value="crkd_les_paul">CRKD Les Paul Pro Model</option>
                  <option value="crkd_guitar">CRKD NEO S Pro Guitar</option>
                  <option value="riffstick">GP2040-CE / RP2040 Riffstick</option>
                  <option value="guitar">Guitar Controller (Standard GH/RB)</option>
                  <option value="drum_kit">Drum Kit (USB-MIDI)</option>
                  <option value="fightstick">Arcade Fightstick</option>
                  <option value="macropad">Keyboard Macropad</option>
                  <option value="generic">Generic Gamepad</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Description</label>
                <textarea
                  rows={3}
                  placeholder="Description and keybindings overview..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#141422',
                    border: '1px solid #33334d',
                    borderRadius: '4px',
                    color: '#eee'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    backgroundColor: '#e94560',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Create Template
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: '#2d2d44',
                    color: '#bbb',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Game Assignment Panel */}
        {assigningTemplateName && (
          <div style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#93c5fd' }}>
                Assign Template "{assigningTemplateName}" to Game:
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>
                Will apply Steam Input VDF configuration when launching title
              </div>
            </div>

            <select
              value={selectedGameAppId}
              onChange={(e) => setSelectedGameAppId(Number(e.target.value))}
              style={{
                padding: '8px 12px',
                backgroundColor: '#121220',
                border: '1px solid #33334d',
                borderRadius: '4px',
                color: '#eee',
                minWidth: '220px'
              }}
            >
              {games.length === 0 ? (
                <option value={0}>No Steam Games Detected</option>
              ) : (
                games.map((g) => (
                  <option key={g.appId} value={g.appId}>
                    {g.name} ({g.appId})
                  </option>
                ))
              )}
            </select>

            <button
              onClick={handleAssignSubmit}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Apply Assignment
            </button>

            <button
              onClick={() => setAssigningTemplateName(null)}
              style={{
                padding: '8px 12px',
                backgroundColor: '#2d2d44',
                color: '#ccc',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            {assignStatus && (
              <span style={{ fontSize: '12px', color: '#4ade80' }}>{assignStatus}</span>
            )}
          </div>
        )}

        {/* Template List */}
        {['base', 'user', 'local'].map((catKey) => {
          if (selectedCategory !== 'all' && selectedCategory !== catKey) return null;
          const list = filterList(categorized[catKey as keyof typeof categorized] || []);
          if (list.length === 0 && selectedCategory !== 'all') {
            return (
              <div key={catKey} style={{ color: '#666', padding: '20px 0' }}>
                No {catKey} templates found.
              </div>
            );
          }
          if (list.length === 0) return null;

          const groupTitle = catKey === 'base' ? 'Base Templates (Defaults)'
            : catKey === 'user' ? 'User Custom Templates'
            : 'Local Vault & Backups';

          return (
            <div key={catKey} style={{ marginBottom: '28px' }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#a0a0b8',
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #28283c',
                paddingBottom: '6px'
              }}>
                {groupTitle} ({list.length})
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px'
              }}>
                {list.map((tmpl) => {
                  const isActive = activeTemplate?.metadata.name === tmpl.metadata.name;
                  return (
                    <div
                      key={tmpl.metadata.name}
                      style={{
                        backgroundColor: isActive ? '#1c1c32' : '#141422',
                        border: `1px solid ${isActive ? '#e94560' : '#27273a'}`,
                        borderRadius: '8px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isActive ? '0 0 12px rgba(233, 69, 96, 0.2)' : 'none',
                        transition: 'border-color 0.15s ease'
                      }}
                    >
                      <div>
                        {/* Title & Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: '#fff', fontWeight: 600 }}>
                            {tmpl.metadata.title || tmpl.metadata.name}
                          </h4>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '10px',
                            backgroundColor: '#2a2a40',
                            color: '#e94560',
                            textTransform: 'uppercase'
                          }}>
                            {tmpl.metadata.deviceBlueprintId || 'gamepad'}
                          </span>
                        </div>

                        {/* Description */}
                        <p style={{
                          fontSize: '12px',
                          color: '#9ca3af',
                          margin: '0 0 12px',
                          minHeight: '36px',
                          lineHeight: '1.4'
                        }}>
                          {tmpl.metadata.description || 'No description provided.'}
                        </p>

                        {/* Meta info */}
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '16px' }}>
                          Author: {tmpl.metadata.author || 'Unknown'} • Modified: {new Date(tmpl.metadata.updatedAt).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        borderTop: '1px solid #222235',
                        paddingTop: '12px'
                      }}>
                        <button
                          onClick={() => onSelectTemplate(tmpl.metadata.name)}
                          style={{
                            flex: 1,
                            padding: '6px 12px',
                            backgroundColor: isActive ? '#e94560' : '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {isActive ? 'Active' : 'Select / Edit'}
                        </button>
                        <button
                          onClick={() => setAssigningTemplateName(tmpl.metadata.name)}
                          title="Assign to Steam Game"
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#27273a',
                            color: '#eee',
                            border: '1px solid #383850',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          Assign Game
                        </button>
                        <button
                          onClick={() => {
                            const copyName = `${tmpl.metadata.name}_copy`;
                            onCloneTemplate(tmpl, copyName);
                          }}
                          title="Clone Template"
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#27273a',
                            color: '#eee',
                            border: '1px solid #383850',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          Clone
                        </button>
                        <button
                          onClick={() => onExportTemplate(tmpl)}
                          title="Export .deckforge.json"
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#27273a',
                            color: '#eee',
                            border: '1px solid #383850',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          Export
                        </button>
                        {catKey !== 'base' && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete template "${tmpl.metadata.name}"?`)) {
                                onDeleteTemplate(tmpl.metadata.name);
                              }
                            }}
                            title="Delete Template"
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#381c24',
                              color: '#ff6b81',
                              border: '1px solid #552230',
                              borderRadius: '4px',
                              fontSize: '11px',
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
