import { runCodeTool } from './run_code/run_code';

export const chatTools = [runCodeTool] as const;

export const toolDefinitions = chatTools.map((t) => t.definition);

export const toolByName = new Map(chatTools.map((t) => [t.definition.name, t] as const));


