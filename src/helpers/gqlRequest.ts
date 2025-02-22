import {
  array,
  type BaseIssue,
  type BaseSchema,
  type InferOutput,
  looseObject,
  nullable,
  optional,
  parse,
  string,
  unknown,
  ValiError,
} from 'valibot';

import type { ExecutionFailedTuple, ExecutionTuple } from '../types/execution.js';

function maybe<S extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(schema: S) {
  return optional(nullable(schema));
}

interface GqlErrorShape {
  message?: string | null;
  extensions: {
    errorData: {
      code: string;
    };
  };
}

const GqlResponse = looseObject({
  data: unknown(),
  errors: maybe(array(looseObject({
    message: maybe(string()),
    extensions: looseObject({
      errorData: looseObject({
        code: string(),
      }),
    }),
  }))),
});

export interface GqlRequestOptions {
  authToken?: string;
}

export type GqlRequestError =
  | [type: 'gql', errors: { code: string; message?: string }[]]
  | [type: 'http', status: number, statusText: string]
  | [type: 'fetch', error: Error]
  | [type: 'invalid-data', error: Error | ValiError<any>];

export type GqlRequestResult<T> = ExecutionTuple<T, GqlRequestError>;

function toFailedExecutionTuple<T>(error: T): ExecutionFailedTuple<T> {
  return [false, error];
}

/**
 * Performs a GraphQL request.
 *
 * This function is not throwing errors, but returns them.
 * @param apiBaseURL - URL to send request to.
 * @param query - GraphQL query.
 * @param variables - query variables.
 * @param schema - structure used to validate the response.
 * @param options - additional options.
 */
export async function gqlRequest<S extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(
  apiBaseURL: string,
  query: string,
  variables: Record<string, unknown>,
  schema: S,
  options?: GqlRequestOptions,
): Promise<GqlRequestResult<InferOutput<S>>> {
  async function runIteration(): Promise<GqlRequestResult<InferOutput<S>>> {
    let response: Response;
    try {
      response = await fetch(apiBaseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `jwt ${(options || {}).authToken}`,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      return toFailedExecutionTuple(['fetch', e as Error]);
    }

    let data: { data?: unknown; errors?: GqlErrorShape[] | null } | undefined | void;
    let err: Error | undefined;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      data = await response.json().then(j => parse(GqlResponse, j)).catch(e => {
        err = e;
      });
    }

    if (!data) {
      return toFailedExecutionTuple(
        !response.ok
          ? ['http', response.status, response.statusText]
          : ['invalid-data', err!],
      );
    }

    if (data.errors) {
      return toFailedExecutionTuple(['gql', data.errors.map(e => ({
        code: e.extensions.errorData.code,
        message: e.message || undefined,
      }))]);
    }
    try {
      return [true, parse(schema, data.data)];
    } catch (e) {
      return toFailedExecutionTuple(['invalid-data', e as ValiError<any>]);
    }
  }

  const retries = 3;
  for (let i = 0; i < retries; i++) {
    const result = await runIteration();
    if (result[0] || i === retries - 1) {
      return result;
    }
    // Sleep: 800ms, 1600ms
    await new Promise(res => {
      setTimeout(res, Math.pow(2, i + 3) * 100);
    });
  }

  // Unreachable.
  return null as any;
}