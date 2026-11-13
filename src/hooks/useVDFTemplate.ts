import { useState, useEffect, useCallback, useRef } from 'react';
import { VDFTemplate, SteamGame } from '../types';

export interface TemplateCategorized {
  base: VDFTemplate[];
  user: VDFTemplate[];
  local: VDFTemplate[];
}

export function useVDFTemplate(initialTemplateName?: string) {
  const [templates, setTemplates] = useState<VDFTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<VDFTemplate | null>(null);
  const [originalTemplate, setOriginalTemplate] = useState<VDFTemplate | null>(null);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Undo / Redo history
  const historyRef = useRef<VDFTemplate[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:8765/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
        if (initialTemplateName && !activeTemplate) {
          const matched = data.find((t: VDFTemplate) => t.metadata.name === initialTemplateName);
          if (matched) {
            setActiveTemplate(matched);
            setOriginalTemplate(JSON.parse(JSON.stringify(matched)));
            historyRef.current = [JSON.parse(JSON.stringify(matched))];
            historyIndexRef.current = 0;
          }
        }
      } else {
        setError(`Failed to fetch templates: ${res.statusText}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching templates');
    } finally {
      setIsLoading(false);
    }
  }, [initialTemplateName, activeTemplate]);

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8765/api/games');
      if (res.ok) {
        const data = await res.json();
        setGames(data);
      }
    } catch (err) {
      console.warn('Failed to fetch Steam games:', err);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchGames();
  }, [fetchTemplates, fetchGames]);

  // Update active template with undo history
  const updateActiveTemplate = useCallback((updater: (prev: VDFTemplate) => VDFTemplate) => {
    setActiveTemplate((prev: VDFTemplate | null) => {
      if (!prev) return null;
      const updated = updater(prev);

      // Truncate future history if branched
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      historyRef.current.push(JSON.parse(JSON.stringify(updated)));
      historyIndexRef.current = historyRef.current.length - 1;

      setIsDirty(true);
      return updated;
    });
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const restored = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
      setActiveTemplate(restored);
      setIsDirty(JSON.stringify(restored) !== JSON.stringify(originalTemplate));
    }
  }, [originalTemplate]);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const restored = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
      setActiveTemplate(restored);
      setIsDirty(JSON.stringify(restored) !== JSON.stringify(originalTemplate));
    }
  }, [originalTemplate]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  // Categorize templates
  const categorized: TemplateCategorized = {
    base: templates.filter((t: VDFTemplate) => t.metadata.tags?.includes('base') || t.metadata.author === 'Valve' || t.metadata.author === 'DeckForge'),
    user: templates.filter((t: VDFTemplate) => t.metadata.tags?.includes('user') || (!t.metadata.tags?.includes('base') && !t.metadata.tags?.includes('local'))),
    local: templates.filter((t: VDFTemplate) => t.metadata.tags?.includes('local')),
  };

  // CRUD Operations
  const loadTemplate = useCallback(async (name: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8765/api/templates/${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setActiveTemplate(data);
        setOriginalTemplate(JSON.parse(JSON.stringify(data)));
        historyRef.current = [JSON.parse(JSON.stringify(data))];
        historyIndexRef.current = 0;
        setIsDirty(false);
      } else {
        setError(`Failed to load template ${name}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading template');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveTemplate = useCallback(async (templateToSave?: VDFTemplate) => {
    const target = templateToSave || activeTemplate;
    if (!target) return false;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8765/api/templates/${encodeURIComponent(target.metadata.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });

      if (res.ok) {
        setIsDirty(false);
        setOriginalTemplate(JSON.parse(JSON.stringify(target)));
        await fetchTemplates();
        return true;
      } else {
        setError(`Failed to save template: ${res.statusText}`);
        return false;
      }
    } catch (err: any) {
      setError(err?.message || 'Error saving template');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeTemplate, fetchTemplates]);

  const cloneTemplate = useCallback(async (template: VDFTemplate, newName: string) => {
    const cloned: VDFTemplate = {
      ...JSON.parse(JSON.stringify(template)),
      metadata: {
        ...template.metadata,
        name: newName,
        title: `${template.metadata.title} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [...(template.metadata.tags || []).filter((t) => t !== 'base'), 'user'],
      },
    };
    return await saveTemplate(cloned);
  }, [saveTemplate]);

  const deleteTemplate = useCallback(async (name: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8765/api/templates/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (activeTemplate?.metadata.name === name) {
          setActiveTemplate(null);
          setOriginalTemplate(null);
          setIsDirty(false);
        }
        await fetchTemplates();
        return true;
      } else {
        setError(`Failed to delete template: ${res.statusText}`);
        return false;
      }
    } catch (err: any) {
      setError(err?.message || 'Error deleting template');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeTemplate, fetchTemplates]);

  const exportTemplate = useCallback((template: VDFTemplate) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(template, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${template.metadata.name}.deckforge.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }, []);

  const importTemplate = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as VDFTemplate;
      if (!parsed.metadata || !parsed.actionSets) {
        throw new Error('Invalid template schema');
      }
      return await saveTemplate(parsed);
    } catch (err: any) {
      setError(`Import failed: ${err.message}`);
      return false;
    }
  }, [saveTemplate]);

  const assignGameTemplate = useCallback(async (appId: number, templateName: string) => {
    try {
      const res = await fetch(`http://localhost:8765/api/games/${appId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName }),
      });
      if (res.ok) {
        await fetchGames();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to assign template to game:', err);
      return false;
    }
  }, [fetchGames]);

  const fetchVDFDiff = useCallback(async (templateName: string) => {
    try {
      const res = await fetch(`http://localhost:8765/api/templates/${encodeURIComponent(templateName)}/diff`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Failed to fetch diff from backend:', err);
    }
    return null;
  }, []);

  return {
    templates,
    categorized,
    activeTemplate,
    originalTemplate,
    setActiveTemplate,
    updateActiveTemplate,
    games,
    isLoading,
    error,
    isDirty,
    loadTemplate,
    saveTemplate,
    cloneTemplate,
    deleteTemplate,
    exportTemplate,
    importTemplate,
    assignGameTemplate,
    fetchVDFDiff,
    undo,
    redo,
    canUndo,
    canRedo,
    refreshTemplates: fetchTemplates,
  };
}
