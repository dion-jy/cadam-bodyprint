import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '@shared/types';
import { useConversation } from '@/services/conversationService';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import { useMessagesQuery } from '@/services/messageService';
import Tree from '@shared/Tree';
import {
  ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { ChatSection } from '@/components/chat/ChatSection';
import { Button } from '@/components/ui/button';
import { ChevronsRight, MessageSquare, GitBranch } from 'lucide-react';
import { ViewerSection } from '@/components/viewer/ViewerSection';
import { ParameterSection } from '@/components/parameter/ParameterSection';
import { useBlob } from '@/contexts/BlobContext';
import { useColor } from '@/contexts/ColorContext';
import { AssemblyProvider } from '@/contexts/AssemblyProvider';
import { AssemblyPanel } from '@/components/assembly/AssemblyPanel';
import { AssemblyToggle } from '@/components/assembly/AssemblyToggle';
import { useAssembly } from '@/contexts/AssemblyContext';
import { useAssemblyRenderer } from '@/hooks/useAssemblyRenderer';
import { useAuth } from '@/contexts/AuthContext';
import { useVersionHistoryContext } from '@/contexts/VersionHistoryContext';
import { VersionPanel } from '@/components/history/VersionPanel';
import { CompareViewer } from '@/components/viewer/CompareViewer';
import { DiffView } from '@/components/history/DiffView';

const PANEL_SIZES = {
  CHAT: {
    DEFAULT: 30,
    MIN: 384,
    MAX: 550,
  },
  PREVIEW: {
    DEFAULT: 45,
    MIN: 20,
  },
  PARAMETERS: {
    DEFAULT: 30,
    MIN: 320,
    MAX: 384,
  },
} as const;

export function ParametricEditor() {
  const { compileScadToBlob } = useAssemblyRenderer();

  return (
    <AssemblyProvider compileScadToBlob={compileScadToBlob}>
      <ParametricEditorInner />
    </AssemblyProvider>
  );
}

type LeftPanelTab = 'chat' | 'history';

function ParametricEditorInner() {
  const { conversation } = useConversation();
  const { currentMessage, setCurrentMessage } = useCurrentMessage();
  const { setBlob } = useBlob();
  const { setColor } = useColor();
  const { state: assemblyState } = useAssembly();
  const { user } = useAuth();
  const {
    versions,
    selectedVersion,
    selectVersion,
    compareState,
    compare,
    clearCompare,
    autoCommit,
    isLoading: versionLoading,
  } = useVersionHistoryContext();

  const [isParametersPanelCollapsed, setIsParametersPanelCollapsed] =
    useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>('chat');
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const parameterPanelRef = useRef<ImperativePanelHandle>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const { data: messages = [] } = useMessagesQuery();

  const lastMessage = useMemo(() => {
    if (conversation.current_message_leaf_id) {
      return messages.find(
        (msg) => msg.id === conversation.current_message_leaf_id,
      );
    }
    return messages[messages.length - 1];
  }, [messages, conversation.current_message_leaf_id]);

  const messageTree = useMemo(() => {
    return new Tree<Message>(messages);
  }, [messages]);

  const currentMessageBranch = useMemo(() => {
    return messageTree.getPath(lastMessage?.id ?? '');
  }, [lastMessage, messageTree]);

  useEffect(() => {
    currentMessageBranch.forEach((message) => {
      if (message.id === currentMessage?.id) {
        setCurrentMessage(message);
      }
    });
  }, [currentMessageBranch, currentMessage, setCurrentMessage]);

  useEffect(() => {
    setCurrentMessage(null);
    setBlob(null);
    setColor('#00A6FF');
  }, [conversation.id, setCurrentMessage, setBlob, setColor]);

  useEffect(() => {
    if (lastMessage?.role === 'assistant') {
      setCurrentMessage(lastMessage);
    }
  }, [lastMessage, setCurrentMessage]);

  // Auto-commit when assistant generates code
  useEffect(() => {
    if (!lastMessage?.content.artifact?.code) return;
    if (lastMessage.role !== 'assistant') return;

    const code = lastMessage.content.artifact.code;

    // Find the user message that triggered this response
    const userMsg = currentMessageBranch.find(
      (m) => m.id === lastMessage.parent_message_id,
    );
    const commitMsg =
      userMsg?.content.text?.slice(0, 120) || 'Code update';

    const authorName = user?.user_metadata?.full_name || user?.email || 'User';
    const authorEmail = user?.email || 'user@cadam.app';

    autoCommit(code, commitMsg, {
      name: authorName,
      email: authorEmail,
    });
  }, [lastMessage, currentMessageBranch, autoCommit, user]);

  // Handle restore: when user restores a version, apply it to the current message
  const handleRestore = useCallback(
    (version: { code: string; message: string }) => {
      if (!currentMessage?.content.artifact) return;

      // Create updated message with restored code
      const restoredMessage: Message = {
        ...currentMessage,
        content: {
          ...currentMessage.content,
          artifact: {
            ...currentMessage.content.artifact,
            code: version.code,
          },
        },
      };
      setCurrentMessage(restoredMessage);

      // Auto-commit the restoration
      const authorName =
        user?.user_metadata?.full_name || user?.email || 'User';
      const authorEmail = user?.email || 'user@cadam.app';
      autoCommit(version.code, `Restored: ${version.message}`, {
        name: authorName,
        email: authorEmail,
      });

      // Clear selection
      selectVersion(null);
    },
    [currentMessage, setCurrentMessage, autoCommit, user, selectVersion],
  );

  // Update container width on resize
  const setContainerRef = useCallback((element: HTMLDivElement) => {
    // Initial measurement
    setContainerWidth(element.offsetWidth);

    // Create ResizeObserver to watch for container size changes
    resizeObserverRef.current = new ResizeObserver(() => {
      setContainerWidth(element.offsetWidth);
    });
    resizeObserverRef.current.observe(element);
    return () => {
      // Cleanup when element is removed
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, []);

  // Calculate panel sizes based on container width
  const chatPanelSizes = useMemo(() => {
    if (containerWidth === 0)
      return { defaultSize: 30, minSize: 0, maxSize: 100 };

    const minSize = (PANEL_SIZES.CHAT.MIN / containerWidth) * 100;
    const maxSize = (PANEL_SIZES.CHAT.MAX / containerWidth) * 100;
    const defaultSize = Math.min(
      Math.max(PANEL_SIZES.CHAT.DEFAULT, minSize),
      maxSize,
    );
    return {
      defaultSize,
      minSize,
      maxSize,
    };
  }, [containerWidth]);

  const parametersPanelSizes = useMemo(() => {
    if (containerWidth === 0)
      return { defaultSize: 25, minSize: 15, maxSize: 30 };

    const chatMinPixels = PANEL_SIZES.CHAT.MIN;
    const previewMinPixels = (PANEL_SIZES.PREVIEW.MIN / 100) * containerWidth;
    const availableForParameters =
      containerWidth - chatMinPixels - previewMinPixels;

    const maxPixelsAvailable = Math.min(
      PANEL_SIZES.PARAMETERS.MAX,
      availableForParameters,
    );

    const minSize = (PANEL_SIZES.PARAMETERS.MIN / containerWidth) * 100;
    const maxSize = (maxPixelsAvailable / containerWidth) * 100;

    const adjustedMaxSize = Math.max(maxSize, minSize);
    const adjustedMinSize = Math.min(minSize, adjustedMaxSize);

    const defaultSize = Math.min(
      Math.max(PANEL_SIZES.PARAMETERS.DEFAULT, adjustedMinSize),
      adjustedMaxSize,
    );

    return {
      defaultSize,
      minSize: adjustedMinSize,
      maxSize: adjustedMaxSize,
    };
  }, [containerWidth]);
  const hasArtifact = useMemo(
    () => !!currentMessage?.content.artifact,
    [currentMessage],
  );

  // Optimized collapse/expand handlers
  const handleChatCollapse = useCallback(() => {
    const panel = chatPanelRef.current;
    if (panel) {
      panel.collapse();
      setIsChatCollapsed(true);
    }
  }, []);

  const handleChatExpand = useCallback(() => {
    const panel = chatPanelRef.current;
    if (panel) {
      panel.expand();
      setIsChatCollapsed(false);
    }
  }, []);

  const handleParametersCollapse = useCallback(() => {
    const panel = parameterPanelRef.current;
    if (panel) {
      panel.collapse();
      setIsParametersPanelCollapsed(true);
    }
  }, []);

  const handleParametersExpand = useCallback(() => {
    const panel = parameterPanelRef.current;
    if (panel) {
      panel.expand();
      setIsParametersPanelCollapsed(false);
    }
  }, []);

  const showAssemblyPanel = assemblyState.isAssemblyMode;
  const isComparing = !!compareState;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-[#292828]"
      ref={setContainerRef}
    >
      {/* Assembly mode toggle bar */}
      <div className="flex items-center justify-center border-b border-adam-neutral-700 py-1.5">
        <AssemblyToggle />
      </div>
      <PanelGroup
        key={`${hasArtifact ? 'with-params' : 'no-params'}-${showAssemblyPanel ? 'asm' : 'single'}-${isComparing ? 'cmp' : 'norm'}`}
        direction="horizontal"
        className="h-full w-full"
      >
        {/* Left panel: Chat/History (single mode) or Assembly Panel (assembly mode) */}
        <Panel
          collapsible
          ref={chatPanelRef}
          defaultSize={chatPanelSizes.defaultSize}
          minSize={chatPanelSizes.minSize}
          maxSize={chatPanelSizes.maxSize}
          id="chat-panel"
          order={0}
        >
          <div className="relative flex h-full flex-col">
            {showAssemblyPanel ? (
              <AssemblyPanel />
            ) : (
              <>
                {/* Tab switcher */}
                <div className="flex border-b border-adam-neutral-700">
                  <button
                    onClick={() => setLeftPanelTab('chat')}
                    className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                      leftPanelTab === 'chat'
                        ? 'border-b-2 border-adam-blue text-adam-blue'
                        : 'text-adam-text-secondary hover:text-adam-text-primary'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Chat
                  </button>
                  <button
                    onClick={() => setLeftPanelTab('history')}
                    className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                      leftPanelTab === 'history'
                        ? 'border-b-2 border-adam-blue text-adam-blue'
                        : 'text-adam-text-secondary hover:text-adam-text-primary'
                    }`}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    History
                    {versions.length > 0 && (
                      <span className="rounded-full bg-adam-neutral-700 px-1.5 text-[10px]">
                        {versions.length}
                      </span>
                    )}
                  </button>
                </div>
                {/* Tab content */}
                {leftPanelTab === 'chat' ? (
                  <div className="flex-1 overflow-hidden">
                    <ChatSection messages={currentMessageBranch ?? []} />
                  </div>
                ) : (
                  <div className="flex-1 overflow-hidden">
                    <VersionPanel
                      versions={versions}
                      selectedVersion={selectedVersion}
                      compareState={compareState}
                      isLoading={versionLoading}
                      onSelectVersion={selectVersion}
                      onCompare={compare}
                      onClearCompare={clearCompare}
                      onRestore={handleRestore}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle group relative">
          {!isChatCollapsed && (
            <div className="absolute left-1 top-1/2 z-50 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Button
                variant="ghost"
                className="rounded-l-none rounded-r-lg border-b border-r border-t border-gray-200/20 bg-adam-bg-secondary-dark p-2 text-adam-text-primary transition-colors dark:border-gray-800 [@media(hover:hover)]:hover:bg-adam-neutral-950 [@media(hover:hover)]:hover:text-adam-neutral-10"
                onClick={handleChatCollapse}
              >
                <ChevronsRight className="h-5 w-5 rotate-180" />
              </Button>
            </div>
          )}
          {isChatCollapsed && (
            <div className="absolute left-0 top-1/2 z-50 -translate-y-1/2">
              <Button
                aria-label="Expand chat panel"
                onClick={handleChatExpand}
                className="flex h-[100px] w-9 flex-col items-center rounded-l-none rounded-r-lg bg-adam-bg-secondary-dark px-1.5 py-2 text-adam-text-primary"
              >
                <ChevronsRight className="h-5 w-5 text-white" />
                <div className="flex flex-1 items-center justify-center">
                  <span className="rotate-90 transform text-center text-base font-semibold text-white">
                    Chat
                  </span>
                </div>
              </Button>
            </div>
          )}
        </PanelResizeHandle>
        <Panel
          defaultSize={
            PANEL_SIZES.PREVIEW.DEFAULT +
            (hasArtifact ? 0 : parametersPanelSizes.defaultSize)
          }
          minSize={
            PANEL_SIZES.PREVIEW.MIN +
            (hasArtifact ? 0 : parametersPanelSizes.minSize)
          }
          id="preview-panel"
          order={1}
        >
          {isComparing ? (
            <div className="flex h-full flex-col">
              {/* 3D Compare top half */}
              <div className="flex-1">
                <CompareViewer
                  oldCode={compareState.oldCode}
                  newCode={compareState.newCode}
                  oldLabel={`v${versions.length - versions.findIndex((v) => v.oid === compareState.oldVersion.oid)}`}
                  newLabel={`v${versions.length - versions.findIndex((v) => v.oid === compareState.newVersion.oid)}`}
                />
              </div>
              {/* Code Diff bottom half */}
              <div className="h-[40%] border-t border-adam-neutral-700">
                <DiffView
                  oldCode={compareState.oldCode}
                  newCode={compareState.newCode}
                  oldLabel={`v${versions.length - versions.findIndex((v) => v.oid === compareState.oldVersion.oid)}`}
                  newLabel={`v${versions.length - versions.findIndex((v) => v.oid === compareState.newVersion.oid)}`}
                />
              </div>
            </div>
          ) : (
            <ViewerSection />
          )}
        </Panel>
        {hasArtifact && !isComparing && (
          <>
            <PanelResizeHandle className="resize-handle group relative">
              {!isParametersPanelCollapsed && (
                <div className="absolute right-1 top-1/2 z-50 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    className="rounded-l-lg rounded-r-none border-b border-l border-t border-gray-200/20 bg-adam-bg-secondary-dark p-2 text-adam-text-primary transition-colors dark:border-gray-800 [@media(hover:hover)]:hover:bg-adam-neutral-950 [@media(hover:hover)]:hover:text-adam-neutral-10"
                    onClick={handleParametersCollapse}
                  >
                    <ChevronsRight className="h-5 w-5" />
                  </Button>
                </div>
              )}
              {isParametersPanelCollapsed && (
                <div className="absolute right-0 top-1/2 z-50 -translate-y-1/2">
                  <Button
                    aria-label="Expand parameters panel"
                    onClick={handleParametersExpand}
                    className="flex h-[140px] w-9 flex-col items-center rounded-l-lg rounded-r-none bg-adam-bg-secondary-dark p-2 px-1.5 py-2 text-adam-text-primary"
                  >
                    <ChevronsRight className="mb-3 h-5 w-5 rotate-180 text-white" />
                    <div className="flex flex-1 items-center justify-center">
                      <span className="min-w-[100px] -rotate-90 transform text-center text-base font-semibold text-white">
                        Parameters
                      </span>
                    </div>
                  </Button>
                </div>
              )}
            </PanelResizeHandle>
            <Panel
              collapsible
              ref={parameterPanelRef}
              defaultSize={parametersPanelSizes.defaultSize}
              minSize={parametersPanelSizes.minSize}
              maxSize={parametersPanelSizes.maxSize}
              id="parameters-panel"
              order={2}
            >
              <div className="relative h-full">
                <ParameterSection />
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
