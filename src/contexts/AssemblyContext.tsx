import { createContext, useContext } from 'react';

export interface InterfaceContract {
  type: 'rect' | 'circular';
  w?: number;
  d?: number;
  dia?: number;
  socket_depth: number;
  clearance_mm: number;
}

export interface PartSpec {
  name: string;
  description: string;
  dims: { w: number; h: number; d: number };
  interfaces: Record<
    string,
    {
      type: string;
      role: 'socket' | 'plug';
      contract_ref: string;
    }
  >;
}

export interface PartResult {
  name: string;
  code: string;
  error?: string;
  retries: number;
  stlBlob?: Blob;
  renderStatus: 'idle' | 'rendering' | 'done' | 'error';
  renderError?: string;
}

export interface AssemblyState {
  isAssemblyMode: boolean;
  isLoading: boolean;
  prompt: string;
  parts: PartResult[];
  interfaceContracts: Record<string, InterfaceContract>;
  assemblyPreview: string;
  assemblyNotes: string;
  error?: string;
}

export interface AssemblyContextType {
  state: AssemblyState;
  setAssemblyMode: (enabled: boolean) => void;
  generateAssembly: (prompt: string) => Promise<void>;
  renderPart: (partName: string) => void;
  renderAllParts: () => void;
  downloadPartSTL: (partName: string) => void;
  downloadAllSTL: () => void;
  retryPart: (partName: string) => void;
}

export const AssemblyContext = createContext<AssemblyContextType | null>(null);

export function useAssembly(): AssemblyContextType {
  const context = useContext(AssemblyContext);
  if (!context) {
    throw new Error('useAssembly must be used within an AssemblyProvider');
  }
  return context;
}
