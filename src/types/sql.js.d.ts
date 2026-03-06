declare module 'sql.js' {
  export interface Database {
    run(sql: string): void;
    exec(sql: string): any[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface Statement {
    bind(params?: any[]): void;
    step(): boolean;
    get(): any[];
    getAsObject(): any;
    free(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export default function initSqlJs(): Promise<SqlJsStatic>;
}
