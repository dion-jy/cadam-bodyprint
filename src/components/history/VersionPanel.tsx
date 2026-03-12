import { useCallback, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { GitBranch, RotateCcw, SplitSquareHorizontal, X } from 'lucide-react';
import { VersionEntry } from './VersionEntry';
import { VersionCommit } from '@/lib/gitVersioning';
import { CompareState } from '@/hooks/useVersionHistory';

interface VersionPanelProps {
  versions: VersionCommit[];
  selectedVersion: VersionCommit | null;
  compareState: CompareState;
  isLoading: boolean;
  onSelectVersion: (version: VersionCommit | null) => void;
  onCompare: (oldVersion: VersionCommit, newVersion: VersionCommit) => void;
  onClearCompare: () => void;
  onRestore: (version: VersionCommit) => void;
}

export function VersionPanel({
  versions,
  selectedVersion,
  compareState,
  isLoading,
  onSelectVersion,
  onCompare,
  onClearCompare,
  onRestore,
}: VersionPanelProps) {
  const [compareFrom, setCompareFrom] = useState<VersionCommit | null>(null);

  const handleVersionSelect = useCallback(
    (version: VersionCommit) => {
      if (compareFrom) {
        // We're in compare mode, selecting the second version
        if (compareFrom.oid !== version.oid) {
          // Ensure older version is first
          const fromTs = compareFrom.timestamp;
          const toTs = version.timestamp;
          if (fromTs < toTs) {
            onCompare(compareFrom, version);
          } else {
            onCompare(version, compareFrom);
          }
        }
        setCompareFrom(null);
      } else {
        onSelectVersion(version);
      }
    },
    [compareFrom, onSelectVersion, onCompare],
  );

  const startCompare = useCallback(() => {
    if (selectedVersion) {
      setCompareFrom(selectedVersion);
      onSelectVersion(null);
    }
  }, [selectedVersion, onSelectVersion]);

  const cancelCompare = useCallback(() => {
    setCompareFrom(null);
    onClearCompare();
  }, [onClearCompare]);

  // Versions from git log are newest-first; display the same way
  // but assign version numbers from oldest (1) to newest (N)
  const totalVersions = versions.length;

  return (
    <div className="flex h-full flex-col border-r border-neutral-700 bg-adam-bg-secondary-dark">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-adam-neutral-700 px-4 py-3">
        <GitBranch className="h-4 w-4 text-adam-blue" />
        <span className="text-sm font-semibold text-adam-text-primary">
          Version History
        </span>
        <span className="ml-auto text-[10px] text-adam-text-secondary">
          {totalVersions} version{totalVersions !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Compare mode banner */}
      {compareFrom && !compareState && (
        <div className="flex items-center gap-2 border-b border-adam-blue/30 bg-adam-blue/10 px-4 py-2">
          <span className="text-xs text-adam-blue">
            Select second version to compare
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-5 w-5 text-adam-blue hover:text-adam-text-primary"
            onClick={cancelCompare}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Compare state banner */}
      {compareState && (
        <div className="flex items-center gap-2 border-b border-adam-blue/30 bg-adam-blue/10 px-4 py-2">
          <SplitSquareHorizontal className="h-3.5 w-3.5 text-adam-blue" />
          <span className="text-xs text-adam-blue">Comparing versions</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-5 w-5 text-adam-blue hover:text-adam-text-primary"
            onClick={cancelCompare}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Version list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading && versions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-adam-text-secondary">
              Loading history...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <GitBranch className="h-6 w-6 text-adam-neutral-500" />
              <p className="text-xs text-adam-text-secondary">
                No versions yet. Generate or edit code to create the first
                version.
              </p>
            </div>
          ) : (
            versions.map((version, index) => (
              <VersionEntry
                key={version.oid}
                version={version}
                versionNumber={totalVersions - index}
                isCurrent={index === 0}
                isSelected={
                  selectedVersion?.oid === version.oid ||
                  compareFrom?.oid === version.oid
                }
                onSelect={handleVersionSelect}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      {selectedVersion && !compareFrom && !compareState && (
        <div className="flex gap-2 border-t border-adam-neutral-700 p-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-adam-neutral-600 bg-transparent text-xs text-adam-text-primary hover:bg-adam-neutral-800"
            onClick={startCompare}
          >
            <SplitSquareHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Compare
          </Button>
          {versions[0]?.oid !== selectedVersion.oid && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-adam-blue/40 bg-transparent text-xs text-adam-blue hover:bg-adam-blue/10"
              onClick={() => onRestore(selectedVersion)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
