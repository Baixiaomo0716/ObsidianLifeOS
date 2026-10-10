import type { BinaryFingerprint } from "../../ports/attachment";
import { StoreError } from "../../domain/errors";
export class BrowserBinaryFingerprint implements BinaryFingerprint {
  async of(bytes: ArrayBuffer): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new StoreError("unsupported_capability", "宿主不支持附件校验摘要");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}
