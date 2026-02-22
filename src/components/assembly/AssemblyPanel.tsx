import { useState } from 'react';
import { useAssembly } from '@/contexts/AssemblyContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  Download,
  Play,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AssemblyPanel() {
  const {
    state,
    generateAssembly,
    renderPart,
    renderAllParts,
    downloadPartSTL,
    downloadAllSTL,
    retryPart,
  } = useAssembly();
  const [promptInput, setPromptInput] = useState('');

  const handleGenerate = () => {
    if (promptInput.trim()) {
      generateAssembly(promptInput.trim());
    }
  };

  const hasPartsWithSTL = state.parts.some((p) => p.stlBlob);
  const allPartsRendered = state.parts
    .filter((p) => p.code && !p.error)
    .every((p) => p.renderStatus === 'done');

  return (
    <div className="flex h-full flex-col bg-adam-bg-secondary-dark text-adam-text-primary">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-adam-neutral-700 p-4">
        <Package className="h-5 w-5 text-adam-blue" />
        <h2 className="text-lg font-semibold">Assembly Mode</h2>
      </div>

      {/* Prompt input */}
      <div className="border-b border-adam-neutral-700 p-4">
        <Textarea
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder="Describe your multi-part object..."
          className="mb-3 min-h-[80px] resize-none border-adam-neutral-700 bg-adam-neutral-950 text-sm text-adam-text-primary placeholder:text-adam-text-secondary"
          disabled={state.isLoading}
        />
        <Button
          onClick={handleGenerate}
          disabled={state.isLoading || !promptInput.trim()}
          className="w-full bg-adam-blue text-white hover:bg-adam-blue/90"
        >
          {state.isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Decomposing & Generating...
            </>
          ) : (
            'Generate Assembly'
          )}
        </Button>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="mx-4 mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <p className="text-sm text-red-300">{state.error}</p>
          </div>
        </div>
      )}

      {/* Assembly notes */}
      {state.assemblyNotes && (
        <div className="mx-4 mt-3 rounded-md border border-adam-neutral-700 bg-adam-neutral-950 p-3">
          <p className="text-xs text-adam-text-secondary">
            {state.assemblyNotes}
          </p>
        </div>
      )}

      {/* Parts list */}
      {state.parts.length > 0 && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-adam-text-secondary">
              Parts ({state.parts.length})
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={renderAllParts}
                disabled={state.parts.every(
                  (p) =>
                    p.renderStatus === 'rendering' ||
                    p.renderStatus === 'done' ||
                    !!p.error,
                )}
                className="border-adam-neutral-700 text-xs"
              >
                <Play className="mr-1 h-3 w-3" />
                Render All
              </Button>
              {hasPartsWithSTL && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadAllSTL}
                  className="border-adam-neutral-700 text-xs"
                >
                  <Download className="mr-1 h-3 w-3" />
                  Download All
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {state.parts.map((part) => (
              <PartCard
                key={part.name}
                part={part}
                onRender={() => renderPart(part.name)}
                onDownload={() => downloadPartSTL(part.name)}
                onRetry={() => retryPart(part.name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Interface contracts summary */}
      {Object.keys(state.interfaceContracts).length > 0 && (
        <div className="border-t border-adam-neutral-700 p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-adam-text-secondary">
            Interface Contracts
          </h3>
          <div className="space-y-1">
            {Object.entries(state.interfaceContracts).map(
              ([name, contract]) => (
                <div
                  key={name}
                  className="rounded bg-adam-neutral-950 px-2 py-1 text-xs text-adam-text-secondary"
                >
                  <span className="font-mono text-adam-blue">{name}</span>:{' '}
                  {contract.type === 'circular'
                    ? `dia=${contract.dia}mm`
                    : `${contract.w}x${contract.d}mm`}
                  , depth={contract.socket_depth}mm
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface PartCardProps {
  part: {
    name: string;
    code: string;
    error?: string;
    retries: number;
    stlBlob?: Blob;
    renderStatus: string;
    renderError?: string;
  };
  onRender: () => void;
  onDownload: () => void;
  onRetry: () => void;
}

function PartCard({ part, onRender, onDownload, onRetry }: PartCardProps) {
  const [showCode, setShowCode] = useState(false);

  const statusIcon = {
    idle: null,
    rendering: (
      <Loader2 className="h-4 w-4 animate-spin text-adam-blue" />
    ),
    done: <CheckCircle className="h-4 w-4 text-green-400" />,
    error: <AlertCircle className="h-4 w-4 text-red-400" />,
  }[part.renderStatus];

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        part.error
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-adam-neutral-700 bg-adam-neutral-950',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm font-medium">
            {part.name.replace(/_/g, ' ')}
          </span>
          {part.retries > 0 && (
            <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-300">
              {part.retries} retries
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {part.code && !part.error && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCode(!showCode)}
                className="h-7 px-2 text-xs"
              >
                {showCode ? 'Hide' : 'Code'}
              </Button>
              {part.renderStatus !== 'done' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onRender}
                  disabled={part.renderStatus === 'rendering'}
                  className="h-7 px-2 text-xs"
                >
                  <Play className="mr-1 h-3 w-3" />
                  Render
                </Button>
              )}
              {part.stlBlob && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDownload}
                  className="h-7 px-2 text-xs"
                >
                  <Download className="mr-1 h-3 w-3" />
                  STL
                </Button>
              )}
            </>
          )}
          {(part.error || part.renderStatus === 'error') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRetry}
              className="h-7 px-2 text-xs text-yellow-300"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {part.error && (
        <p className="mt-2 text-xs text-red-300">{part.error}</p>
      )}

      {part.renderError && (
        <p className="mt-2 text-xs text-red-300">
          Render error: {part.renderError}
        </p>
      )}

      {showCode && part.code && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/50 p-2 text-xs text-gray-300">
          <code>{part.code}</code>
        </pre>
      )}
    </div>
  );
}
