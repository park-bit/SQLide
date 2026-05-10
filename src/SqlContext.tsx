import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';

type SqlJsStatic = any;
type Database = any;

export interface QueryExecResult {
  columns: string[];
  values: Array<Array<string | number | null>>;
}

export interface LogEntry {
  level: 'info' | 'ok' | 'error' | 'warn';
  message: string;
  timestamp: Date;
}

export interface QueryResult {
  results: QueryExecResult[];
  affectedRows?: number;
  error?: string;
  executionTime: number;
}

export interface HistoryEntry {
  id: string;
  query: string;
  timestamp: Date;
  success: boolean;
  executionTime: number;
  rowCount?: number;
}

export interface SchemaTable {
  name: string;
  type: 'table' | 'view';
  columns: SchemaColumn[];
  foreignKeys: SchemaForeignKey[];
  rowCount?: number;
}

export interface SchemaColumn {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  defaultValue: string | null;
}

export interface SchemaForeignKey {
  column: string;
  refTable: string;
  refColumn: string;
}

interface SqlContextValue {
  db: Database | null;
  ready: boolean;
  initError: string | null;
  history: HistoryEntry[];
  schema: SchemaTable[];
  lastExecution: number;
  execute: (sql: string) => Promise<QueryResult>;
  query: (sql: string) => QueryExecResult[];
  exportDb: () => Uint8Array | null;
  importDb: (data: Uint8Array) => Promise<void>;
  refreshSchema: () => void;
  clearHistory: () => void;
}

const SqlContext = createContext<SqlContextValue | null>(null);

function loadSqlJsFromCDN(): Promise<SqlJsStatic> {
  return new Promise((resolve, reject) => {
    if ((window as any).initSqlJs) {
      resolve((window as any).initSqlJs);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.min.js';
    script.onload = () => {
      resolve((window as any).initSqlJs);
    };
    script.onerror = () => reject(new Error('Failed to load sql.js from CDN'));
    document.head.appendChild(script);
  });
}

function translateMySqlToSqlite(sql: string): string {
  let mapped = sql;
  
  // 1. Backticks to Double Quotes (Standard SQL)
  mapped = mapped.replace(/`/g, '"');

  // 2. AUTO_INCREMENT -> AUTOINCREMENT (and ensure INTEGER type)
  mapped = mapped.replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT');
  
  // Map various INT types with size and constraints to just INTEGER PRIMARY KEY AUTOINCREMENT
  mapped = mapped.replace(/\b(INT|BIGINT|MEDIUMINT|SMALLINT|TINYINT)(\s*\(\d+\))?\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  mapped = mapped.replace(/\b(INT|BIGINT|MEDIUMINT|SMALLINT|TINYINT)(\s*\(\d+\))?\s+AUTOINCREMENT\b/gi, 'INTEGER AUTOINCREMENT');
  
  // 3. Data Types Compatibility (Clean up sizes and map to SQLite natives)
  mapped = mapped.replace(/\bUNSIGNED\b/gi, '');
  mapped = mapped.replace(/\b(BIGINT|MEDIUMINT|SMALLINT|TINYINT)(\s*\(\d+\))?/gi, 'INTEGER');
  mapped = mapped.replace(/\bDECIMAL(\s*\(\d+(,\d+)?\))?/gi, 'REAL');
  mapped = mapped.replace(/\bDOUBLE(\s+PRECISION)?(\s*\(\d+(,\d+)?\))?/gi, 'REAL');
  mapped = mapped.replace(/\bFLOAT(\s*\(\d+(,\d+)?\))?/gi, 'REAL');
  mapped = mapped.replace(/\bJSON\b/gi, 'TEXT');
  
  // 4. Common MySQL Functions to SQLite equivalents
  // Note: SQLite requires parentheses around function calls in DEFAULT clauses
  mapped = mapped.replace(/\bDEFAULT\s+NOW\(\)/gi, "DEFAULT (datetime('now'))");
  mapped = mapped.replace(/\bDEFAULT\s+CURDATE\(\)/gi, "DEFAULT (date('now'))");
  mapped = mapped.replace(/\bDEFAULT\s+CURTIME\(\)/gi, "DEFAULT (time('now'))");
  
  // Also handle naked function calls
  mapped = mapped.replace(/\bNOW\(\)/gi, "datetime('now')");
  mapped = mapped.replace(/\bCURDATE\(\)/gi, "date('now')");
  mapped = mapped.replace(/\bCURTIME\(\)/gi, "time('now')");
  mapped = mapped.replace(/\bRAND\(\)/gi, "random()");

  return mapped;
}

export function SqlProvider({ children }: { children: React.ReactNode }) {
  const dbRef = useRef<Database | null>(null);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [lastExecution, setLastExecution] = useState(0);

  useEffect(() => {
    loadSqlJsFromCDN()
      .then(initSqlJs => initSqlJs({
        locateFile: (file: string) =>
          `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`,
      }))
      .then((SQL: SqlJsStatic) => {
        dbRef.current = new SQL.Database();
        setReady(true);
      })
      .catch((e: Error) => {
        console.error('sql.js init error:', e);
        setInitError(String(e));
      });
  }, []);

  const refreshSchema = useCallback(() => {
    const db = dbRef.current;
    if (!db) return;
    try {
      const tables: SchemaTable[] = [];
      const tableRes = db.exec(
        `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );
      if (tableRes.length > 0 && tableRes[0].values) {
        for (const row of tableRes[0].values) {
          const tname = row[0] as string;
          const ttype = row[1] as 'table' | 'view';
          const colRes = db.exec(`PRAGMA table_info("${tname}")`);
          const columns: SchemaColumn[] = (colRes[0]?.values ?? []).map(
            (c: Array<string | number | null>) => ({
              name: c[1] as string,
              type: ((c[2] as string) || 'TEXT').toUpperCase(),
              pk: (c[5] as number) > 0,
              notNull: (c[3] as number) === 1,
              defaultValue: c[4] as string | null,
            })
          );

          const fkRes = db.exec(`PRAGMA foreign_key_list("${tname}")`);
          const foreignKeys: SchemaForeignKey[] = (fkRes[0]?.values ?? []).map(
            (f: Array<string | number | null>) => ({
              column: f[3] as string,
              refTable: f[2] as string,
              refColumn: f[4] as string,
            })
          );

          let rowCount: number | undefined;
          try {
            const countRes = db.exec(`SELECT COUNT(*) FROM "${tname}"`);
            rowCount = countRes[0]?.values?.[0]?.[0] as number;
          } catch { }

          tables.push({ name: tname, type: ttype, columns, foreignKeys, rowCount });
        }
      }
      setSchema(tables);
    } catch { /* ignore */ }
  }, []);

  const execute = useCallback(async (rawSql: string): Promise<QueryResult> => {
    const db = dbRef.current;
    if (!db) return { results: [], error: 'Database not ready', executionTime: 0 };

    const t0 = performance.now();
    const allResults: QueryExecResult[] = [];
    let affectedRowsTotal = 0;

    try {
      // Split into statements while keeping track of approximate line numbers
      // This is a naive split but good enough for general localization
      const statements = rawSql.split(/;(?=(?:[^']*'[^']*')*[^']*$)/);
      let currentLine = 1;

      for (let rawStmt of statements) {
        const trimmed = rawStmt.trim();
        if (!trimmed) {
          currentLine += (rawStmt.match(/\n/g) || []).length;
          continue;
        }

        const sql = translateMySqlToSqlite(trimmed);
        try {
          const res = db.exec(sql);
          if (res.length > 0) allResults.push(...res);

          // Track affected rows
          if (
            sql.toUpperCase().startsWith('INSERT') ||
            sql.toUpperCase().startsWith('UPDATE') ||
            sql.toUpperCase().startsWith('DELETE')
          ) {
            try {
              const r = db.exec('SELECT changes()');
              affectedRowsTotal += (r[0]?.values?.[0]?.[0] as number) || 0;
            } catch { }
          }
        } catch (e: any) {
          const executionTime = performance.now() - t0;
          const errMsg = e instanceof Error ? e.message : String(e);
          
          // Try to pinpoint line number in the original script
          const linesBefore = rawSql.substring(0, rawSql.indexOf(trimmed)).split('\n').length;
          
          const entry: HistoryEntry = {
            id: crypto.randomUUID(),
            query: trimmed.slice(0, 200),
            timestamp: new Date(),
            success: false,
            executionTime,
          };
          setHistory(h => [entry, ...h].slice(0, 200));
          setLastExecution(Date.now());
          
          return { 
            results: allResults, 
            error: `${errMsg} (approx. line ${linesBefore})`, 
            executionTime 
          };
        }
        
        currentLine += (rawStmt.match(/\n/g) || []).length;
      }

      const executionTime = performance.now() - t0;
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        query: rawSql.trim().slice(0, 200),
        timestamp: new Date(),
        success: true,
        executionTime,
        rowCount: allResults[0]?.values?.length,
      };
      setHistory(h => [entry, ...h].slice(0, 200));
      setLastExecution(Date.now());
      refreshSchema();
      return { results: allResults, affectedRows: affectedRowsTotal, executionTime };
    } catch (e: any) {
      const executionTime = performance.now() - t0;
      return { results: [], error: String(e), executionTime };
    }
  }, [refreshSchema]);

  const query = useCallback((sql: string): QueryExecResult[] => {
    const db = dbRef.current;
    if (!db) return [];
    return db.exec(sql);
  }, []);

  const exportDb = useCallback((): Uint8Array | null => {
    return dbRef.current?.export() ?? null;
  }, []);

  const importDb = useCallback(async (data: Uint8Array) => {
    const SQL = (window as any).initSqlJs;
    if (SQL) {
      dbRef.current = new SQL.Database(data);
      setLastExecution(Date.now());
      refreshSchema();
    }
  }, [refreshSchema]);

  const clearHistory = useCallback(() => setHistory([]), []);

  return (
    <SqlContext.Provider value={{
      db: dbRef.current, ready, initError,
      history, schema, lastExecution, execute, query, exportDb, importDb, refreshSchema, clearHistory,
    }}>
      {children}
    </SqlContext.Provider>
  );
}

export function useSql() {
  const ctx = useContext(SqlContext);
  if (!ctx) throw new Error('useSql must be used inside SqlProvider');
  return ctx;
}
