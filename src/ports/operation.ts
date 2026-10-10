import type { Jilu } from "../domain/entities";
import type { ContentVersion, Edit } from "./entity-store";
export interface Fingerprint { of(text: string): Promise<string> }
export interface DeviceIdentity { get(): Promise<string> }
export type Action = { readonly caozuoleixing: "chuangjian"; readonly lujing: string; readonly jilu: Jilu; readonly zhengwen?: string }
  | { readonly caozuoleixing: "gengxin"; readonly banben: ContentVersion; readonly xiugai: Edit }
  | { readonly caozuoleixing: "fuben"; readonly banben: ContentVersion; readonly xiugai: Edit; readonly dangqianyuanwen: string };
export interface OperationRequest { readonly caozuobiaoshi: string; readonly buzhou: readonly Action[] }
export interface Receipt {
  readonly caozuobiaoshi: string;
  readonly buzhou: readonly { readonly lujing: string; readonly mubiaobiaoshi: string }[];
}
