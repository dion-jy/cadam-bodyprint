import { useCallback, useRef } from 'react';
import { WorkerMessageType } from '@/worker/types';

/**
 * Hook that provides a compileScadToBlob function for assembly mode.
 * Uses a dedicated Web Worker to render OpenSCAD code to STL blobs.
 * Each call creates a fresh worker to avoid state issues.
 */
export function useAssemblyRenderer() {
  const workerRef = useRef<Worker | null>(null);

  const compileScadToBlob = useCallback(
    async (code: string): Promise<Blob> => {
      return new Promise<Blob>((resolve, reject) => {
        // Create a fresh worker for each render to avoid state issues
        const worker = new Worker(
          new URL('../worker/worker.ts', import.meta.url),
          { type: 'module' },
        );
        workerRef.current = worker;

        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Render timed out after 120s'));
        }, 120000);

        worker.addEventListener('message', (event) => {
          const { type, err, data } = event.data;

          if (
            type === WorkerMessageType.PREVIEW ||
            type === WorkerMessageType.EXPORT
          ) {
            clearTimeout(timeout);
            worker.terminate();

            if (err) {
              reject(
                new Error(
                  err.message || err.stdErr?.join('\n') || 'Render failed',
                ),
              );
              return;
            }

            if (data?.output) {
              const blob = new Blob([data.output], { type: 'model/stl' });
              resolve(blob);
            } else {
              reject(new Error('No output from renderer'));
            }
          }
        });

        worker.addEventListener('error', (error) => {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(error.message || 'Worker error'));
        });

        worker.postMessage({
          type: WorkerMessageType.EXPORT,
          data: {
            code,
            params: [],
            fileType: 'stl',
          },
        });
      });
    },
    [],
  );

  return { compileScadToBlob };
}
