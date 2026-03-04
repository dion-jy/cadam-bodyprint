import { useState, useCallback, useEffect, useRef } from 'react';
import {
  commitVersion,
  getHistory,
  diffVersions,
  VersionCommit,
} from '@/lib/gitVersioning';

export type CompareState = {
  oldVersion: VersionCommit;
  newVersion: VersionCommit;
  oldCode: string;
  newCode: string;
} | null;

export function useVersionHistory(conversationId: string | undefined) {
  const [versions, setVersions] = useState<VersionCommit[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionCommit | null>(
    null,
  );
  const [compareState, setCompareState] = useState<CompareState>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track the last committed code to prevent duplicate commits
  const lastCommittedCodeRef = useRef<string>('');

  const refreshHistory = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const history = await getHistory(conversationId);
      setVersions(history);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const autoCommit = useCallback(
    async (
      code: string,
      message: string,
      author: { name: string; email: string },
    ) => {
      if (!conversationId) return;
      // Skip if the code is the same as the last committed code
      if (code === lastCommittedCodeRef.current) return;

      try {
        await commitVersion(conversationId, code, message, author);
        lastCommittedCodeRef.current = code;
        await refreshHistory();
      } catch (err) {
        console.error('[VersionHistory] Failed to auto-commit:', err);
      }
    },
    [conversationId, refreshHistory],
  );

  const compare = useCallback(
    async (oldVersion: VersionCommit, newVersion: VersionCommit) => {
      if (!conversationId) return;
      try {
        const { oldCode, newCode } = await diffVersions(
          conversationId,
          oldVersion.oid,
          newVersion.oid,
        );
        setCompareState({ oldVersion, newVersion, oldCode, newCode });
      } catch (err) {
        console.error('[VersionHistory] Failed to diff:', err);
      }
    },
    [conversationId],
  );

  const clearCompare = useCallback(() => {
    setCompareState(null);
  }, []);

  const selectVersion = useCallback((version: VersionCommit | null) => {
    setSelectedVersion(version);
  }, []);

  return {
    versions,
    selectedVersion,
    selectVersion,
    compareState,
    compare,
    clearCompare,
    autoCommit,
    isLoading,
    refreshHistory,
  };
}
