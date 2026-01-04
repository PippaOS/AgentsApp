// Type definitions for the database API exposed to the renderer process
import type {
  Model,
  CreateModelInput,
  Agent,
  CreateAgentInput,
  Tool,
  CreateToolInput,
  UpdateToolInput,
  Chat,
  ChatWithAgent,
  CreateChatInput,
  Message,
  Config,
  CodeRun,
  File,
  Page,
  Image,
  ChatContextItemWithFile,
  APICall,
  APICallToolCall,
  APICallEntity,
} from './types';
import type { Data } from './data-store';

export interface DbApi {
  migrations: {
    getCurrentVersion: () => Promise<number>;
    getHistory: () => Promise<Array<{ version: number; name: string; applied_at: string }>>;
  };
  models: {
    getAll: () => Promise<Model[]>;
    getByPublicId: (publicId: string) => Promise<Model | null>;
    getById: (id: number) => Promise<Model | null>;
    getByName: (name: string) => Promise<Model | null>;
    getByOpenRouterId: (openrouterId: string) => Promise<Model | null>;
    create: (input: CreateModelInput) => Promise<Model>;
    addFromOpenRouter: (openrouterId: string) => Promise<Model>;
    syncWithOpenRouter: (publicId: string) => Promise<Model>;
    delete: (publicId: string) => Promise<void>;
    deleteById: (id: number) => Promise<void>;
    onUpdated: (callback: () => void) => () => void;
  };
  agents: {
    getAll: () => Promise<Agent[]>;
    getByPublicId: (publicId: string) => Promise<Agent | null>;
    create: (input: CreateAgentInput) => Promise<Agent>;
    updateName: (publicId: string, name: string) => Promise<void>;
    updatePrompt: (publicId: string, prompt: string) => Promise<void>;
    updateAllowParallelToolCalls: (publicId: string, allow: boolean) => Promise<void>;
    updateAvatarUrl: (publicId: string, avatarUrl: string | null) => Promise<void>;
    updateModel: (publicId: string, model: string | null) => Promise<void>;
    updateReasoning: (publicId: string, reasoning: string | null) => Promise<void>;
    updateCanRunCode: (publicId: string, canRunCode: boolean) => Promise<void>;
    updatePermissions: (publicId: string, permissions: string[]) => Promise<void>;
    delete: (publicId: string) => Promise<void>;
    onUpdated: (callback: () => void) => () => void;
  };
  tools: {
    getAll: () => Promise<Tool[]>;
    getByPublicId: (publicId: string) => Promise<Tool | null>;
    create: (input: CreateToolInput) => Promise<Tool>;
    update: (publicId: string, input: UpdateToolInput) => Promise<Tool | null>;
    delete: (publicId: string) => Promise<void>;
    onUpdated: (callback: () => void) => () => void;
  };
  agentTools: {
    getByAgentPublicId: (agentPublicId: string) => Promise<Tool[]>;
    setForAgent: (agentPublicId: string, toolPublicIds: string[]) => Promise<{ ok: boolean }>;
  };
  data: {
    getAll: () => Promise<Data[]>;
    getById: (id: number) => Promise<Data | null>;
    getByParent: (parentId: string) => Promise<Data[]>;
    create: (input: { parent_id: string; key: string; value?: string | null }) => Promise<Data>;
    update: (publicId: string, value: string | null) => Promise<void>;
    updateKeyAndValue: (publicId: string, key: string, value: string | null) => Promise<void>;
    delete: (publicId: string) => Promise<void>;
  };
}

export interface ChatApi {
  getAll: () => Promise<Chat[]>;
  getAllWithAgent: () => Promise<ChatWithAgent[]>;
  getById: (id: number) => Promise<Chat | null>;
  getByPublicId: (publicId: string) => Promise<Chat | null>;
  create: (input?: CreateChatInput) => Promise<Chat>;
  updateTitle: (publicId: string, title: string) => Promise<void>;
  updateAgentPublicId: (publicId: string, agentPublicId: string | null) => Promise<void>;
  delete: (publicId: string) => Promise<void>;
  onUpdated: (callback: () => void) => () => void;
  getMessages: (chatPublicId: string) => Promise<Message[]>;
  createMessage: (input: {
    chat_public_id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    reasoning?: string;
    model?: string;
    message_type?: 'text' | 'chat_context' | 'tool_call' | 'tool_result' | 'image_generation_call' | 'error';
  }) => Promise<Message>;
  stream: (
    chatId: number,
    userContent: string, 
    images: Array<{ id: string; dataUrl: string }> | undefined,
    callbacks: {
      onChunk?: (content: string) => void;
      onReasoning?: (reasoning: string) => void;
      onToolCall?: (toolCall: { id: string; name: string; arguments: string; status: 'streaming' | 'ready' }) => void;
      onImage?: (image: { type: 'image_url'; image_url: { url: string } }) => void;
      onError?: (error: string) => void;
      onDone?: (result: unknown) => void;
    }
  ) => Promise<{ success: boolean }>;
  connectSession: (sessionId: string, onEvent: (data: unknown) => void) => Promise<{ success: true }>;
  sessionPost: (sessionId: string, message: unknown) => boolean;
  disconnectSession: (sessionId: string) => void;
  cancelStream: (chatId: number) => Promise<{ success: boolean; error?: string }>;
  getContext: (chatPublicId: string) => Promise<ChatContextItemWithFile[]>;
  addToContext: (chatPublicId: string, entityId: string, entityType?: 'file' | 'image' | 'page') => Promise<ChatContextItemWithFile>;
  removeFromContext: (contextPublicId: string) => Promise<void>;
  branchFromMessage: (messagePublicId: string) => Promise<{
    newChatPublicId: string;
    content: string;
    images: Array<{ id: string; dataUrl: string }>;
  }>;
  onContextUpdated: (callback: (data: { chatPublicId: string; action: string }) => void) => () => void;
}

export interface ConfigApi {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  getAll: () => Promise<Config[]>;
}

export type SecretMeta =
  | { name: string; exists: false }
  | { name: string; exists: true; created_at: string; updated_at: string };

export interface SecretsApi {
  getMeta: (name: string) => Promise<SecretMeta>;
  listMeta: () => Promise<Array<{ name: string; created_at: string; updated_at: string }>>;
  set: (name: string, plaintext: string) => Promise<{ ok: true }>;
  delete: (name: string) => Promise<{ ok: true }>;
}

export interface FilesApi {
  upload: () => Promise<File | null>;
  uploadFile: () => Promise<UploadFileResult | null>;
  getAll: () => Promise<File[]>;
  getByPublicId: (publicId: string) => Promise<File | null>;
  getPages: (publicId: string) => Promise<Page[]>;
  getPageByPublicId: (publicId: string) => Promise<Page | null>;
  getPageImage: (imagePath: string) => Promise<string | null>;
  getFileContent: (publicId: string) => Promise<string | null>;
  delete: (publicId: string, deleteData?: boolean) => Promise<void>;
  processPDF: (publicId: string) => Promise<File>;
  updateIncludeData: (publicId: string, includeData: boolean) => Promise<File>;
  updatePageIncludeImages: (publicId: string, includeImages: boolean) => Promise<Page>;
  updatePageIncludeText: (publicId: string, includeText: boolean) => Promise<Page>;
  updatePageIncludeData: (publicId: string, includeData: boolean) => Promise<Page>;
  download: (publicId: string) => Promise<{ canceled: boolean; filePath?: string }>;
  onUpdated: (callback: () => void) => () => void;
}

export type UploadFileResult =
  | { kind: 'file'; file: File }
  | { kind: 'image'; image: Image };

export interface ImagesApi {
  upload: () => Promise<Image | null>;
  getAll: () => Promise<Image[]>;
  getByPublicId: (publicId: string) => Promise<Image | null>;
  getImageContent: (publicId: string) => Promise<string | null>;
  saveFromBase64: (base64DataUrl: string, fileName?: string) => Promise<Image>;
  delete: (publicId: string, deleteData?: boolean) => Promise<void>;
  download: (publicId: string) => Promise<{ canceled: boolean; filePath?: string }>;
  onUpdated: (callback: () => void) => () => void;
}

export interface ApiCallsApi {
  getAll: () => Promise<Pick<APICall, 'id' | 'public_id' | 'model' | 'status' | 'total_tokens' | 'cost' | 'created_at'>[]>;
  getById: (
    id: number
  ) => Promise<{ call: APICall; tool_calls: APICallToolCall[]; entities: APICallEntity[] } | null>;
}

export interface CodeRunnerApi {
  run: (publicId: string, code: string, opts?: { timeoutMs?: number }) => Promise<{ output: string; error?: string; exitCode?: number }>;
}

export interface CodeRunsApi {
  getRecent: (limit?: number) => Promise<CodeRun[]>;
  getByPublicId: (publicId: string) => Promise<CodeRun | null>;
}

export interface WorkspaceApi {
  selectSourceDir: () => Promise<{ path: string } | null>;
  sync: (req: { sourcePath: string; destPath?: string; excludes?: string[]; deleteExtraneous?: boolean; rsyncPath?: string }) => Promise<{
    ok: boolean;
    sourcePath: string;
    destPath: string;
    durationMs: number;
    command: { exe: string; args: string[] };
    stdout: string;
    stderr: string;
    error?: string;
    exitCode?: number;
  }>;
  onUpdated: (callback: (data: { ok: boolean; destPath: string }) => void) => () => void;
}

export interface EntityInfo {
  publicId: string;
  table: 'files' | 'pages' | 'images' | 'data';
  name: string;
  route: string;
  parentId?: string;
}

export interface EntityCacheApi {
  get: (publicId: string) => Promise<EntityInfo | null>;
  getBatch: (publicIds: string[]) => Promise<Record<string, EntityInfo | null>>;
  refresh: () => Promise<number>;
  onUpdated: (callback: (entity: EntityInfo) => void) => () => void;
}

declare global {
  interface Window {
    db: DbApi;
    chat: ChatApi;
    config: ConfigApi;
    secrets: SecretsApi;
    files: FilesApi;
    images: ImagesApi;
    apiCalls: ApiCallsApi;
    entityCache: EntityCacheApi;
    codeRunner: CodeRunnerApi;
    codeRuns: CodeRunsApi;
    workspace: WorkspaceApi;
  }
}

export {};
