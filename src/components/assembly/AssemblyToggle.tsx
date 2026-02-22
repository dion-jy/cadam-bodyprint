import { useAssembly } from '@/contexts/AssemblyContext';
import { cn } from '@/lib/utils';
import { Package, Pencil } from 'lucide-react';

export function AssemblyToggle() {
  const { state, setAssemblyMode } = useAssembly();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-adam-neutral-700 bg-adam-neutral-950 p-0.5">
      <button
        onClick={() => setAssemblyMode(false)}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
          !state.isAssemblyMode
            ? 'bg-adam-blue text-white'
            : 'text-adam-text-secondary hover:text-adam-text-primary',
        )}
      >
        <Pencil className="h-3.5 w-3.5" />
        Single Part
      </button>
      <button
        onClick={() => setAssemblyMode(true)}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
          state.isAssemblyMode
            ? 'bg-adam-blue text-white'
            : 'text-adam-text-secondary hover:text-adam-text-primary',
        )}
      >
        <Package className="h-3.5 w-3.5" />
        Assembly
      </button>
    </div>
  );
}
