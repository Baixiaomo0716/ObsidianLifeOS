import { StoreError } from "../../domain/errors";
import { uuidV4 } from "../../domain/validation";
import type { IdGenerator } from "../../ports/id-generator";
import type { DeviceIdentity, Fingerprint } from "../../ports/operation";
export class BrowserIds implements IdGenerator {
  next(): string {
    if (!globalThis.crypto?.getRandomValues) throw new StoreError("unsupported_capability", "宿主不支持安全标识生成");
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 15) | 64;
    bytes[8] = (bytes[8]! & 63) | 128;
    const text = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
  }
}
export class BrowserFingerprint implements Fingerprint {
  async of(text: string): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new StoreError("unsupported_capability", "宿主不支持操作指纹计算");
    try {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch (error) { throw new StoreError("unsupported_capability", "宿主操作指纹计算失败，未启动文件操作", undefined, error); }
  }
}
export class BrowserDeviceIdentity implements DeviceIdentity {
  constructor(private readonly ids: IdGenerator) {}
  async get(): Promise<string> {
    // Browser-local identity is outside the Vault, so Git cannot copy it to a phone.
    try {
      const key = "lifeos.shebeibiaoshi", existing = globalThis.localStorage.getItem(key);
      if (existing !== null) {
        if (!uuidV4.test(existing)) throw new StoreError("invalid_format", "本机标识非法，请核对本地设置");
        return existing.toLowerCase();
      }
      const id = this.ids.next().toLowerCase();
      globalThis.localStorage.setItem(key, id);
      if (globalThis.localStorage.getItem(key) !== id) throw new Error("identity not persisted");
      return id;
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError("unsupported_capability", "本机标识无法可靠保存，操作暂停", undefined, error);
    }
  }
}
