import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DiffViewProps {
  oldCode: string;
  newCode: string;
  oldLabel: string;
  newLabel: string;
}

type DiffLine = {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
};

function computeUnifiedDiff(oldCode: string, newCode: string): DiffLine[] {
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const result: DiffLine[] = [];
  let i = m,
    j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: 'added',
        content: newLines[j - 1],
        newLineNum: j,
      });
      j--;
    } else {
      stack.push({
        type: 'removed',
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i--;
    }
  }

  // Reverse since we built it backwards
  while (stack.length > 0) {
    result.push(stack.pop()!);
  }

  return result;
}

export function DiffView({ oldCode, newCode, oldLabel, newLabel }: DiffViewProps) {
  const diffLines = useMemo(
    () => computeUnifiedDiff(oldCode, newCode),
    [oldCode, newCode],
  );

  const stats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-adam-bg-dark">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-adam-neutral-700 px-4 py-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-adam-text-secondary">{oldLabel}</span>
          <span className="text-adam-text-secondary">&rarr;</span>
          <span className="text-adam-text-secondary">{newLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-green-400">+{stats.added}</span>
          <span className="text-red-400">-{stats.removed}</span>
        </div>
      </div>

      {/* Diff content */}
      <ScrollArea className="flex-1">
        <div className="font-mono text-xs">
          {diffLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                'flex border-b border-adam-neutral-800/30',
                line.type === 'added' && 'bg-green-500/10',
                line.type === 'removed' && 'bg-red-500/10',
              )}
            >
              {/* Line numbers */}
              <div className="flex w-20 flex-shrink-0 select-none text-[10px] text-adam-text-secondary/50">
                <span className="w-10 px-2 text-right">
                  {line.oldLineNum ?? ''}
                </span>
                <span className="w-10 px-2 text-right">
                  {line.newLineNum ?? ''}
                </span>
              </div>

              {/* Diff marker */}
              <span
                className={cn(
                  'w-5 flex-shrink-0 select-none px-1 text-center',
                  line.type === 'added' && 'text-green-400',
                  line.type === 'removed' && 'text-red-400',
                )}
              >
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>

              {/* Code content */}
              <pre
                className={cn(
                  'flex-1 whitespace-pre px-2 py-0.5',
                  line.type === 'added' && 'text-green-300',
                  line.type === 'removed' && 'text-red-300',
                  line.type === 'unchanged' && 'text-adam-text-primary/70',
                )}
              >
                {line.content}
              </pre>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
