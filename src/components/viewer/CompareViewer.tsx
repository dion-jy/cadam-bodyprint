import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  GizmoHelper,
  GizmoViewcube,
  Stage,
  Environment,
  OrthographicCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOpenSCAD } from '@/hooks/useOpenSCAD';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { Loader2 } from 'lucide-react';

interface CompareViewerProps {
  oldCode: string;
  newCode: string;
  oldLabel: string;
  newLabel: string;
}

/**
 * Syncs camera state from a source OrbitControls to this scene's camera.
 */
function CameraSync({
  sourceRef,
}: {
  sourceRef: React.RefObject<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    zoom: number;
  } | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    let animId: number;
    function sync() {
      if (sourceRef.current) {
        camera.position.copy(sourceRef.current.position);
        if ('zoom' in camera) {
          (camera as THREE.OrthographicCamera).zoom =
            sourceRef.current.zoom;
          camera.updateProjectionMatrix();
        }
      }
      animId = requestAnimationFrame(sync);
    }
    animId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(animId);
  }, [camera, sourceRef]);

  return null;
}

function CompareScene({
  geometry,
  color,
  isLeader,
  cameraStateRef,
  onControlsChange,
}: {
  geometry: THREE.BufferGeometry | null;
  color: string;
  isLeader: boolean;
  cameraStateRef: React.RefObject<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    zoom: number;
  } | null>;
  onControlsChange?: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const handleChange = useCallback(() => {
    if (isLeader && controlsRef.current && cameraStateRef.current) {
      const controls = controlsRef.current;
      cameraStateRef.current.position.copy(controls.object.position);
      cameraStateRef.current.target.copy(controls.target);
      cameraStateRef.current.zoom = controls.object.zoom;
      onControlsChange?.();
    }
  }, [isLeader, cameraStateRef, onControlsChange]);

  return (
    <Canvas className="block h-full w-full">
      <color attach="background" args={['#3B3B3B']} />
      <OrthographicCamera
        makeDefault
        position={[-100, 100, 100]}
        zoom={40}
        near={0.1}
        far={1000}
      />
      <Stage environment={null} intensity={0.6} position={[0, 0, 0]}>
        <Environment files={`${import.meta.env.BASE_URL}/city.hdr`} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-5, 5, 5]} intensity={0.2} />
        <directionalLight position={[-5, 5, -5]} intensity={0.2} />
        <directionalLight position={[0, 5, 0]} intensity={0.2} />
        <directionalLight position={[-5, -5, -5]} intensity={0.6} />
        {geometry && (
          <mesh
            geometry={geometry}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
          >
            <meshStandardMaterial
              color={color}
              metalness={0.6}
              roughness={0.3}
              envMapIntensity={0.3}
            />
          </mesh>
        )}
      </Stage>
      {isLeader ? (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          onChange={handleChange}
        />
      ) : (
        <CameraSync sourceRef={cameraStateRef} />
      )}
      {isLeader && (
        <GizmoHelper alignment="bottom-right" margin={[80, 90]}>
          <GizmoViewcube />
        </GizmoHelper>
      )}
    </Canvas>
  );
}

function useCompileCode(code: string) {
  const { compileScad, isCompiling, output } = useOpenSCAD();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

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

  return { geometry, isCompiling };
}

export function CompareViewer({
  oldCode,
  newCode,
  oldLabel,
  newLabel,
}: CompareViewerProps) {
  const { geometry: oldGeometry, isCompiling: oldCompiling } =
    useCompileCode(oldCode);
  const { geometry: newGeometry, isCompiling: newCompiling } =
    useCompileCode(newCode);

  const cameraStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    zoom: number;
  }>({
    position: new THREE.Vector3(-100, 100, 100),
    target: new THREE.Vector3(0, 0, 0),
    zoom: 40,
  });

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-1">
        {/* Left: old version */}
        <div className="relative flex-1 border-r border-adam-neutral-700">
          <div className="absolute left-3 top-3 z-10 rounded-md bg-adam-bg-dark/80 px-2 py-1 text-[10px] font-medium text-adam-text-secondary backdrop-blur-sm">
            {oldLabel}
          </div>
          {oldCompiling && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-adam-neutral-700/30 backdrop-blur-sm">
              <Loader2 className="h-5 w-5 animate-spin text-adam-blue" />
            </div>
          )}
          <CompareScene
            geometry={oldGeometry}
            color="#FF6B6B"
            isLeader={true}
            cameraStateRef={cameraStateRef}
          />
        </div>

        {/* Right: new version */}
        <div className="relative flex-1">
          <div className="absolute left-3 top-3 z-10 rounded-md bg-adam-bg-dark/80 px-2 py-1 text-[10px] font-medium text-adam-text-secondary backdrop-blur-sm">
            {newLabel}
          </div>
          {newCompiling && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-adam-neutral-700/30 backdrop-blur-sm">
              <Loader2 className="h-5 w-5 animate-spin text-adam-blue" />
            </div>
          )}
          <CompareScene
            geometry={newGeometry}
            color="#00A6FF"
            isLeader={false}
            cameraStateRef={cameraStateRef}
          />
        </div>
      </div>
    </div>
  );
}
