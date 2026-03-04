import { createContext, useContext } from 'react';
import { VersionCommit } from '@/lib/gitVersioning';
import { CompareState } from '@/hooks/useVersionHistory';

type VersionHistoryContextType = {
  versions: VersionCommit[];
  selectedVersion: VersionCommit | null;
  selectVersion: (version: VersionCommit | null) => void;
  compareState: CompareState;
  compare: (oldVersion: VersionCommit, newVersion: VersionCommit) => void;
  clearCompare: () => void;
  autoCommit: (
    code: string,
    message: string,
    author: { name: string; email: string },
  ) => Promise<void>;
  isLoading: boolean;
  refreshHistory: () => Promise<void>;
};

export const VersionHistoryContext =
  createContext<VersionHistoryContextType | null>(null);

export function useVersionHistoryContext() {
  const context = useContext(VersionHistoryContext);
  if (!context) {
    throw new Error(
      'useVersionHistoryContext must be used within a VersionHistoryProvider',
    );
  }
  return context;
}
