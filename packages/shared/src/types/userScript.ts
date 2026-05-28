export interface UserScript {
  id: string;
  name: string;
  description: string;
  type: 'js' | 'css';
  code: string;
  matchPatterns: string[];
  enabled: boolean;
  runAt: 'document-start' | 'document-end' | 'document-idle';
  createdAt: number;
  updatedAt: number;
}

export type UserScriptData = Omit<UserScript, 'id' | 'createdAt' | 'updatedAt'>;

export interface UserScriptMeta {
  name: string;
  description: string;
  code: string;
  matchPatterns: string[];
  runAt: 'document-start' | 'document-end' | 'document-idle';
}

export interface ScriptError {
  scriptId: string;
  url: string;
  error: string;
  timestamp: number;
}
