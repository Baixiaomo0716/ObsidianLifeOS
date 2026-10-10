// process must perform the callback against fresh text under the host's local
// read/modify/write guard. A read followed by write is not an implementation.
export interface FileSystem {
  list(): Promise<readonly string[]>;
  read(path: string): Promise<string>;
  create(path: string, text: string): Promise<void>;
  process(path: string, transform: (current: string) => string): Promise<string>;
}
