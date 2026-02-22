import { useState, useCallback, useRef } from 'react';
import {
  AssemblyContext,
  AssemblyState,
  PartResult,
} from './AssemblyContext';
import {
  orchestrateAssembly,
  partResultsFromResponse,
} from '@/services/assemblyService';
import { downloadFile } from '@/utils/downloadUtils';

const initialState: AssemblyState = {
  isAssemblyMode: false,
  isLoading: false,
  prompt: '',
  parts: [],
  interfaceContracts: {},
  assemblyPreview: '',
  assemblyNotes: '',
};

interface AssemblyProviderProps {
  children: React.ReactNode;
  compileScadToBlob: (code: string) => Promise<Blob>;
}

export function AssemblyProvider({
  children,
  compileScadToBlob,
}: AssemblyProviderProps) {
  const [state, setState] = useState<AssemblyState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const updatePart = useCallback(
    (partName: string, updates: Partial<PartResult>) => {
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((p) =>
          p.name === partName ? { ...p, ...updates } : p,
        ),
      }));
    },
    [],
  );

  const setAssemblyMode = useCallback((enabled: boolean) => {
    setState((prev) => ({
      ...(enabled ? prev : initialState),
      isAssemblyMode: enabled,
    }));
  }, []);

  const generateAssembly = useCallback(
    async (prompt: string) => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: undefined,
        prompt,
        parts: [],
      }));

      try {
        const response = await orchestrateAssembly(prompt);

        const parts = partResultsFromResponse(response.parts);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          parts,
          interfaceContracts: response.decomposition.interface_contracts,
          assemblyPreview: response.assemblyPreview,
          assemblyNotes: response.decomposition.assembly_notes,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate assembly',
        }));
      }
    },
    [],
  );

  const renderPart = useCallback(
    async (partName: string) => {
      const part = stateRef.current.parts.find((p) => p.name === partName);
      if (!part || !part.code || part.error) return;

      updatePart(partName, {
        renderStatus: 'rendering',
        renderError: undefined,
      });

      try {
        const blob = await compileScadToBlob(part.code);
        updatePart(partName, { renderStatus: 'done', stlBlob: blob });
      } catch (error) {
        updatePart(partName, {
          renderStatus: 'error',
          renderError:
            error instanceof Error ? error.message : 'Render failed',
        });
      }
    },
    [compileScadToBlob, updatePart],
  );

  const renderAllParts = useCallback(async () => {
    const parts = stateRef.current.parts.filter(
      (p) => p.code && !p.error,
    );
    // Render sequentially to avoid overwhelming the WASM worker
    for (const part of parts) {
      await renderPart(part.name);
    }
  }, [renderPart]);

  const downloadPartSTL = useCallback((partName: string) => {
    const part = stateRef.current.parts.find((p) => p.name === partName);
    if (!part?.stlBlob) return;

    downloadFile({
      content: part.stlBlob,
      filename: `${partName}.stl`,
      mimeType: 'application/octet-stream',
    });
  }, []);

  const downloadAllSTL = useCallback(() => {
    const partsWithSTL = stateRef.current.parts.filter((p) => p.stlBlob);
    for (const part of partsWithSTL) {
      downloadFile({
        content: part.stlBlob!,
        filename: `${part.name}.stl`,
        mimeType: 'application/octet-stream',
      });
    }
  }, []);

  const retryPart = useCallback(
    async (partName: string) => {
      const part = stateRef.current.parts.find((p) => p.name === partName);
      if (!part) return;

      // Re-generate the code through orchestrate with error context
      // For now, just re-render if code exists
      if (part.code && !part.error) {
        await renderPart(partName);
      }
    },
    [renderPart],
  );

  return (
    <AssemblyContext.Provider
      value={{
        state,
        setAssemblyMode,
        generateAssembly,
        renderPart,
        renderAllParts,
        downloadPartSTL,
        downloadAllSTL,
        retryPart,
      }}
    >
      {children}
    </AssemblyContext.Provider>
  );
}
