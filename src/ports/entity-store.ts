import type { Jilu } from "../domain/entities";
import type { Validation } from "../domain/validation";
export interface ContentVersion { readonly path: string; readonly original: string }
export interface Snapshot {
  readonly path: string;
  readonly version: ContentVersion;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly body: string;
  readonly validation: Validation;
}
export interface Edit {
  readonly set?: Readonly<Record<string, unknown>>;
  readonly unset?: readonly string[];
  readonly body?: string;
}
export interface EntityStore {
  create(path: string, record: Jilu, body?: string): Promise<Snapshot>;
  read(path: string): Promise<Snapshot>;
  update(version: ContentVersion, edit: Edit): Promise<Snapshot>;
}
