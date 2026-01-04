import { ToolDefinition } from "./types";
import toolDescription from "./run_code/run_code.md?raw";

export const toolCatalogSection = (
  toolDefinitions: ToolDefinition[],
  canRunCode: boolean
) => {
  if (!canRunCode) return "";
  const runCodeDef = toolDefinitions.find((d) => d.name === "run_code");
  const schemaJson = runCodeDef?.parameters
    ? JSON.stringify(runCodeDef.parameters, null, 2)
    : "{}";

  const lines: string[] = [];
  lines.push("");
  lines.push("<tools>");

  lines.push('<tool name="run_code">');
  lines.push(`<description>${toolDescription.trim()}</description>`);
  lines.push("<tool_input_schema_json>");
  lines.push(schemaJson);
  lines.push("</tool_input_schema_json>");
  lines.push("</tool>");
  lines.push("</tools>");
  return lines.join("\n");
};
