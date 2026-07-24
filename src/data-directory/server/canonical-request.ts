import "server-only";

import type { Principal } from "@/auth/authorization";

import {
  createDirectoryCursorCodec,
  type DirectoryCursorCodec,
  type DirectoryCursorEnvelope,
  type DirectoryScopePurpose,
} from "./cursor";
import {
  getRawDirectoryQuery,
  parseDirectoryQuery,
  type DirectoryFilterDefinition,
  type ParsedDirectoryQuery,
} from "./query-contract";

type CanonicalRequestInput = Readonly<{
  requestTarget: string;
  path: string;
  definitions: readonly DirectoryFilterDefinition[];
  directory: string;
  scopePurpose: DirectoryScopePurpose;
  principal: Principal;
  orderId: string;
  validateTuple: (tuple: DirectoryCursorEnvelope["tuple"]) => boolean;
}>;

export type CanonicalDirectoryRequest =
  | Readonly<{ status: "ready"; query: ParsedDirectoryQuery; cursor?: DirectoryCursorEnvelope }>
  | Readonly<{ status: "redirect"; location: string }>
  | Readonly<{ status: "invalid-query" }>;

function relativeLocation(path: string, query: string) {
  return query ? `${path}?${query}` : path;
}

export function canonicalizeDirectoryRequest(
  input: CanonicalRequestInput,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): CanonicalDirectoryRequest {
  if (!input.path.startsWith("/") || input.path.includes("?") || input.path.includes("#") || input.path.startsWith("//")) {
    return { status: "invalid-query" };
  }
  const parsed = parseDirectoryQuery(input.requestTarget, input.definitions);
  if (!parsed.ok) return { status: "invalid-query" };

  let decodedCursor: DirectoryCursorEnvelope | undefined;
  if (parsed.value.cursor) {
    const decoded = codec.decode(
      parsed.value.cursor,
      {
        directory: input.directory,
        scopePurpose: input.scopePurpose,
        principalId: input.principal.id,
        size: parsed.value.pageSize,
        canonicalFilterQuery: parsed.value.canonicalFilterQuery,
        orderId: input.orderId,
      },
      input.validateTuple,
    );
    if (decoded.status === "invalid") return { status: "invalid-query" };
    if (decoded.status === "stale") {
      const withoutCursor = parsed.value.canonicalQuery
        .split("&")
        .filter((entry) => !entry.startsWith("cursor="))
        .join("&");
      return { status: "redirect", location: relativeLocation(input.path, withoutCursor) };
    }
    decodedCursor = decoded.cursor;
  }

  if (getRawDirectoryQuery(input.requestTarget) !== parsed.value.canonicalQuery) {
    return {
      status: "redirect",
      location: relativeLocation(input.path, parsed.value.canonicalQuery),
    };
  }
  return {
    status: "ready",
    query: parsed.value,
    ...(decodedCursor ? { cursor: decodedCursor } : {}),
  };
}
