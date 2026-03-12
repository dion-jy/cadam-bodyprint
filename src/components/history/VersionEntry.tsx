import { cn } from '@/lib/utils';
import { VersionCommit } from '@/lib/gitVersioning';
import { formatDistanceToNow } from 'date-fns';

interface VersionEntryProps {
  version: VersionCommit;
  versionNumber: number;
  isCurrent: boolean;
  isSelected: boolean;
  onSelect: (version: VersionCommit) => void;
}

export function VersionEntry({
  version,
  versionNumber,
  isCurrent,
  isSelected,
  onSelect,
}: VersionEntryProps) {
  const timeAgo = formatDistanceToNow(new Date(version.timestamp), {
    addSuffix: true,
  });

  // Truncate message for display
  const displayMessage =
    version.message.length > 60
      ? version.message.slice(0, 57) + '...'
      : version.message;

  return (
    <button
      onClick={() => onSelect(version)}
      className={cn(
        'group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        isSelected
          ? 'bg-adam-blue/20 ring-1 ring-adam-blue/40'
          : 'hover:bg-adam-neutral-800/60',
      )}
    >
      {/* Version indicator dot */}
      <div className="mt-1 flex flex-col items-center">
        <div
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            isCurrent
              ? 'bg-adam-blue shadow-[0_0_6px_rgba(0,166,255,0.5)]'
              : 'border border-adam-neutral-500 bg-adam-neutral-700',
          )}
        />
      </div>

      {/* Version info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-adam-text-primary">
            v{versionNumber}
          </span>
          {isCurrent && (
            <span className="rounded-full bg-adam-blue/20 px-1.5 py-0.5 text-[10px] font-medium text-adam-blue">
              current
            </span>
          )}
          <span className="ml-auto text-[10px] text-adam-text-secondary">
            {timeAgo}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-adam-text-secondary">
          {displayMessage}
        </p>
      </div>
    </button>
  );
}
