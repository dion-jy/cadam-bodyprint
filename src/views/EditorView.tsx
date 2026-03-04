import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ParametricEditor } from '../components/ParametricEditor';
import { Message } from '@shared/types';
import { MessageItem, MeshUploadState } from '@/types/misc';
import { useEffect, useState } from 'react';
import { CurrentMessageContext } from '@/contexts/CurrentMessageContext';
import { SelectedItemsContext } from '@/contexts/SelectedItemsContext';
import { useConversation } from '@/services/conversationService';
import { BlobContext } from '@/contexts/BlobContext';
import { ColorContext } from '@/contexts/ColorContext';
import { VersionHistoryContext } from '@/contexts/VersionHistoryContext';
import { useVersionHistory } from '@/hooks/useVersionHistory';

export default function EditorView() {
  const { id: conversationId } = useParams();
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null);
  const [images, setImages] = useState<MessageItem[]>([]);
  const [meshUpload, setMeshUpload] = useState<MeshUploadState | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [color, setColor] = useState<string>('#00A6FF');
  const navigate = useNavigate();
  const { conversation, isConversationLoading } = useConversation();
  const versionHistory = useVersionHistory(conversationId);

  useEffect(() => {
    if (!conversationId) {
      navigate('/');
    }
  }, [conversationId, navigate]);

  if (isConversationLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-adam-bg-secondary-dark text-adam-text-primary">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (!conversation.id) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-adam-bg-secondary-dark text-adam-text-primary">
        <span className="text-2xl font-medium">404</span>
        <span className="text-sm">Conversation not found</span>
      </div>
    );
  }

  return (
    <CurrentMessageContext.Provider
      value={{
        currentMessage,
        setCurrentMessage,
      }}
    >
      <BlobContext.Provider value={{ blob, setBlob }}>
        <ColorContext.Provider value={{ color, setColor }}>
          <SelectedItemsContext.Provider
            value={{ images, setImages, meshUpload, setMeshUpload }}
          >
            <VersionHistoryContext.Provider value={versionHistory}>
              <ParametricEditor />
            </VersionHistoryContext.Provider>
          </SelectedItemsContext.Provider>
        </ColorContext.Provider>
      </BlobContext.Provider>
    </CurrentMessageContext.Provider>
  );
}
