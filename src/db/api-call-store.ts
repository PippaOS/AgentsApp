import { getDatabase } from './database';
import type {
  APICall,
  CreateAPICallInput,
  UpdateAPICallInput,
  APICallToolCall,
  CreateAPICallToolCallInput,
  APICallEntity,
  CreateAPICallEntityInput,
} from './types';
import { nanoid } from 'nanoid';

/**
 * API call logging operations
 */
export const apiCallStore = {
  getRecent(limit = 200): APICall[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT * FROM api_calls
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(limit) as APICall[];
  },

  getRecentMinimal(limit = 200): Pick<APICall, 'id' | 'public_id' | 'model' | 'status' | 'total_tokens' | 'cost' | 'created_at'>[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT id, public_id, model, status, total_tokens, cost, created_at
        FROM api_calls
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(limit) as Pick<APICall, 'id' | 'public_id' | 'model' | 'status' | 'total_tokens' | 'cost' | 'created_at'>[];
  },

  getById(id: number): APICall | null {
    const db = getDatabase();
    const result = db
      .prepare('SELECT * FROM api_calls WHERE id = ?')
      .get(id) as APICall | undefined;
    return result ?? null;
  },

  create(input: CreateAPICallInput): APICall {
    const db = getDatabase();
    const publicId = nanoid();
    const isStreaming = input.is_streaming ? 1 : 0;
    const hasTools = input.has_tools ? 1 : 0;
    const hasImages = input.has_images ? 1 : 0;

    const result = db
      .prepare(
        `
        INSERT INTO api_calls (
          public_id, chat_id, model, request_json, status,
          is_streaming, has_tools, has_images
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        RETURNING *
      `
      )
      .get(
        publicId,
        input.chat_id ?? null,
        input.model,
        input.request_json ?? null,
        isStreaming,
        hasTools,
        hasImages
      ) as APICall;

    return result;
  },

  getByPublicId(publicId: string): APICall | null {
    const db = getDatabase();
    const result = db
      .prepare('SELECT * FROM api_calls WHERE public_id = ?')
      .get(publicId) as APICall | undefined;
    return result ?? null;
  },

  update(input: UpdateAPICallInput): void {
    const db = getDatabase();

    db.prepare(
      `
      UPDATE api_calls SET
        status = COALESCE(?, status),
        model_actual = COALESCE(?, model_actual),
        request_json = COALESCE(?, request_json),
        response_json = COALESCE(?, response_json),
        error_code = COALESCE(?, error_code),
        error_message = COALESCE(?, error_message),
        prompt_tokens = COALESCE(?, prompt_tokens),
        completion_tokens = COALESCE(?, completion_tokens),
        total_tokens = COALESCE(?, total_tokens),
        cached_tokens = COALESCE(?, cached_tokens),
        reasoning_tokens = COALESCE(?, reasoning_tokens),
        latency_ms = COALESCE(?, latency_ms),
        duration_ms = COALESCE(?, duration_ms),
        provider = COALESCE(?, provider),
        finish_reason = COALESCE(?, finish_reason),
        cost = COALESCE(?, cost),
        is_byok = COALESCE(?, is_byok),
        has_tools = COALESCE(?, has_tools),
        has_images = COALESCE(?, has_images),
        completed_at = COALESCE(?, completed_at)
      WHERE public_id = ?
    `
    ).run(
      input.status ?? null,
      input.model_actual ?? null,
      input.request_json ?? null,
      input.response_json ?? null,
      input.error_code ?? null,
      input.error_message ?? null,
      input.prompt_tokens ?? null,
      input.completion_tokens ?? null,
      input.total_tokens ?? null,
      input.cached_tokens ?? null,
      input.reasoning_tokens ?? null,
      input.latency_ms ?? null,
      input.duration_ms ?? null,
      input.provider ?? null,
      input.finish_reason ?? null,
      input.cost ?? null,
      input.is_byok === undefined ? null : input.is_byok ? 1 : 0,
      input.has_tools === undefined ? null : input.has_tools ? 1 : 0,
      input.has_images === undefined ? null : input.has_images ? 1 : 0,
      input.completed_at ?? null,
      input.public_id
    );
  },
};

export const apiCallToolCallStore = {
  getByApiCallId(apiCallId: number): APICallToolCall[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT * FROM api_call_tool_calls
        WHERE api_call_id = ?
        ORDER BY created_at ASC
      `
      )
      .all(apiCallId) as APICallToolCall[];
  },

  create(input: CreateAPICallToolCallInput): APICallToolCall {
    const db = getDatabase();
    const publicId = nanoid();
    const status = input.status ?? 'pending';

    const result = db
      .prepare(
        `
        INSERT INTO api_call_tool_calls (
          public_id, api_call_id, tool_call_id, tool_name, arguments_json,
          status, result_json, error_message, duration_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `
      )
      .get(
        publicId,
        input.api_call_id,
        input.tool_call_id,
        input.tool_name,
        input.arguments_json,
        status,
        input.result_json ?? null,
        input.error_message ?? null,
        input.duration_ms ?? null
      ) as APICallToolCall;

    return result;
  },

  updateResult(publicId: string, updates: Partial<CreateAPICallToolCallInput>): void {
    const db = getDatabase();
    db.prepare(
      `
      UPDATE api_call_tool_calls SET
        result_json = COALESCE(?, result_json),
        status = COALESCE(?, status),
        error_message = COALESCE(?, error_message),
        duration_ms = COALESCE(?, duration_ms)
      WHERE public_id = ?
    `
    ).run(
      updates.result_json ?? null,
      updates.status ?? null,
      updates.error_message ?? null,
      updates.duration_ms ?? null,
      publicId
    );
  },
};

export const apiCallEntityStore = {
  getByApiCallId(apiCallId: number): APICallEntity[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT * FROM api_call_entities
        WHERE api_call_id = ?
        ORDER BY message_index ASC, content_index ASC
      `
      )
      .all(apiCallId) as APICallEntity[];
  },

  create(input: CreateAPICallEntityInput): APICallEntity {
    const db = getDatabase();

    const result = db
      .prepare(
        `
        INSERT INTO api_call_entities (
          api_call_id, entity_id, entity_type, message_index, content_index, detail
        )
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
      `
      )
      .get(
        input.api_call_id,
        input.entity_id,
        input.entity_type,
        input.message_index,
        input.content_index,
        input.detail ?? null
      ) as APICallEntity;

    return result;
  },
};
