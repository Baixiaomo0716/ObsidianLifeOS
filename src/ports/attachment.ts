export interface BinaryFileSystem {
  read(path: string): Promise<ArrayBuffer>;
  create(path: string, bytes: ArrayBuffer): Promise<void>;
}
export interface BinaryFingerprint { of(bytes: ArrayBuffer): Promise<string> }
export interface AttachmentSource { readonly name: string; readonly size: number; readonly type: string; arrayBuffer(): Promise<ArrayBuffer> }
