import { supabase } from '@/lib/supabase';
import type {
  InterfaceContract,
  PartResult,
  PartSpec,
} from '@/contexts/AssemblyContext';

interface OrchestrateResponse {
  decomposition: {
    parts: PartSpec[];
    interface_contracts: Record<string, InterfaceContract>;
    assembly_notes: string;
  };
  parts: Array<{
    name: string;
    code: string;
    error?: string;
    retries: number;
  }>;
  assemblyPreview: string;
  error?: string;
}

export async function orchestrateAssembly(
  prompt: string,
): Promise<OrchestrateResponse> {
  const { data, error } = await supabase.functions.invoke('orchestrate', {
    method: 'POST',
    body: { prompt },
  });

  if (error) {
    throw new Error(error.message || 'Failed to call orchestrate function');
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as OrchestrateResponse;
}

export function partResultsFromResponse(
  parts: OrchestrateResponse['parts'],
): PartResult[] {
  return parts.map((p) => ({
    name: p.name,
    code: p.code,
    error: p.error,
    retries: p.retries,
    renderStatus: 'idle' as const,
  }));
}
