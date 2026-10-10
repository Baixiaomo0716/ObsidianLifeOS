export type StoreErrorCode = "validation" | "conflict" | "not_found" | "already_exists" | "io" | "unsupported_version" | "invalid_format" | "duplicate_id" | "path" | "inactive" | "operation_mismatch" | "foreign_operation" | "unsupported_capability";
export class StoreError extends Error {
  constructor(public readonly code: StoreErrorCode, message: string, public readonly path?: string, public readonly detail?: unknown) {
    super(message);
    this.name = "StoreError";
  }
}
