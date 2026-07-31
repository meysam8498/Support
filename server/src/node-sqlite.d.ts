// تعریف نوع محلی برای node:sqlite (تا @types/node رسمی کامل‌تر شود)
declare module 'node:sqlite' {
  type Binding = null | number | bigint | string | Uint8Array;
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }
  class StatementSync {
    all(...params: Binding[]): Record<string, unknown>[];
    get(...params: Binding[]): Record<string, unknown> | undefined;
    run(...params: Binding[]): RunResult;
    setAllowBareNamedParameters(enabled: boolean): void;
    setReadBigInts(enabled: boolean): void;
    sourceSQL(): string;
    expandedSQL(...params: Binding[]): string;
  }
  export class DatabaseSync {
    constructor(location: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
    disableLoadedExtension(): void;
    enableLoadedExtension(): void;
    loadExtension(path: string): void;
    open(): void;
    applyChangeset(): void;
    createSession(): void;
  }
}
