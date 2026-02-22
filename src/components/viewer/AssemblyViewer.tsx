import { useOpenSCAD } from '@/hooks/useOpenSCAD';
import { useEffect, useState } from 'react';
import { ThreeScene } from '@/components/viewer/ThreeScene';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { BufferGeometry } from 'three';
import { Loader2, CircleAlert } from 'lucide-react';

interface AssemblyViewerProps {
  code: string;
}

export function AssemblyViewer({ code }: AssemblyViewerProps) {
  const { compileScad, isCompiling, output, isError, error } = useOpenSCAD();
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  useEffect(() => {
    if (code) {
      compileScad(code);
    }
  }, [code, compileScad]);

  useEffect(() => {
    if (output && output instanceof Blob) {
      output.arrayBuffer().then((buffer) => {
        const loader = new STLLoader();
        const geom = loader.parse(buffer);
        geom.center();
        geom.computeVertexNormals();
        setGeometry(geom);
      });
    } else {
      setGeometry(null);
    }
  }, [output]);

  return (
    <div className="h-full w-full bg-adam-neutral-700/50">
      {geometry ? (
        <div className="h-full w-full">
          <ThreeScene geometry={geometry} />
        </div>
      ) : isError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <CircleAlert className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-300">Assembly preview failed to render</p>
          {error && (
            <p className="max-w-md text-center text-xs text-adam-text-secondary">
              {error.message}
            </p>
          )}
        </div>
      ) : null}
      {isCompiling && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-adam-neutral-700/30 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-adam-blue" />
            <p className="text-xs font-medium text-adam-text-primary/70">
              Rendering assembly preview...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
