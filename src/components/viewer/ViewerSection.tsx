import { ImageGallery } from './ImageGallery';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import Loader from './Loader';
import { OpenSCADViewer } from './OpenSCADViewer';
import { useIsLoading } from '@/services/messageService';
import { useContext } from 'react';
import { AssemblyContext } from '@/contexts/AssemblyContext';
import { AssemblyViewer } from './AssemblyViewer';

export function ViewerSection() {
  const isLoading = useIsLoading();
  const { currentMessage: message } = useCurrentMessage();
  const assemblyCtx = useContext(AssemblyContext);
  const isAssemblyMode = assemblyCtx?.state.isAssemblyMode ?? false;
  const assemblyPreview = assemblyCtx?.state.assemblyPreview ?? '';
  const assemblyLoading = assemblyCtx?.state.isLoading ?? false;

  return (
    <div className="flex h-full w-full items-center justify-center bg-adam-neutral-700">
      {isAssemblyMode ? (
        assemblyLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader message="Generating assembly" />
          </div>
        ) : assemblyPreview ? (
          <AssemblyViewer code={assemblyPreview} />
        ) : (
          <div className="flex h-full items-center justify-center text-adam-text-secondary">
            <p className="text-sm">Enter a prompt to generate an assembly</p>
          </div>
        )
      ) : isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Loader message="Generating model" />
        </div>
      ) : (
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-2">
          {message?.content.images && Array.isArray(message.content.images) && (
            <ImageGallery imageIds={message.content.images} />
          )}
          {message?.content.artifact?.code && <OpenSCADViewer />}
        </div>
      )}
    </div>
  );
}
