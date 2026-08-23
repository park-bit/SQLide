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
  message?: string; // e.g. "Database 'foo' created."
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

const DEFAULT_DB_NAME = 'main';

interface SqlContextValue {
  db: Database | null;
  ready: boolean;
  initError: string | null;
  history: HistoryEntry[];
  schema: SchemaTable[];
  lastExecution: number;
  currentDatabase: string;
  databases: string[];
  execute: (sql: string) => Promise<QueryResult>;
  query: (sql: string) => QueryExecResult[];
  exportDb: () => Uint8Array | null;
  importDb: (data: Uint8Array, name?: string) => Promise<void>;
  refreshSchema: () => void;
  clearHistory: () => void;
  createDatabase: (name: string) => void;
  useDatabase: (name: string) => boolean;
  dropDatabase: (name: string) => boolean;
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
  mapped = mapped.replace(/`/g, '"');
  mapped = mapped.replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT');
  mapped = mapped.replace(/\b(INT|BIGINT|MEDIUMINT|SMALLINT|TINYINT)(\s*\(\d+\))?\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  mapped = mapped.replace(/\b(INT|BIGINT|MEDIUMINT|SMALLINT|TINYINT)(\s*\(\d+\))?\s+AUTOINCREMENT\b/gi, 'INTEGER AUTOINCREMENT');
  mapped = mapped.replace(/\bUNSIGNED\b/gi, '');
  mapped = mapped.replace(/\b(BIGINT|MEDIUMINT|SMALLINT|TINYINT)(\s*\(\d+\))?/gi, 'INTEGER');
  mapped = mapped.replace(/\bDECIMAL(\s*\(\d+(,\d+)?\))?/gi, 'REAL');
  mapped = mapped.replace(/\bDOUBLE(\s+PRECISION)?(\s*\(\d+(,\d+)?\))?/gi, 'REAL');
  mapped = mapped.replace(/\bFLOAT(\s*\(\d+(,\d+)?\))?/gi, 'REAL');
  mapped = mapped.replace(/\bJSON\b/gi, 'TEXT');
  mapped = mapped.replace(/\bDEFAULT\s+NOW\(\)/gi, "DEFAULT (datetime('now'))");
  mapped = mapped.replace(/\bDEFAULT\s+CURDATE\(\)/gi, "DEFAULT (date('now'))");
  mapped = mapped.replace(/\bDEFAULT\s+CURTIME\(\)/gi, "DEFAULT (time('now'))");
  mapped = mapped.replace(/\bNOW\(\)/gi, "datetime('now')");
  mapped = mapped.replace(/\bCURDATE\(\)/gi, "date('now')");
  mapped = mapped.replace(/\bCURTIME\(\)/gi, "time('now')");
  mapped = mapped.replace(/\bRAND\(\)/gi, "random()");
  return mapped;
}

// Strips leading `-- comment` lines and block comments so db-management regexes
// can match even when a statement is preceded by comments (no semicolon between
// a comment and the next statement, so they land in the same chunk).
function stripLeadingComments(s: string): string {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    const trimmedStart = out.replace(/^\s+/, '');
    if (trimmedStart.startsWith('--')) {
      const nl = trimmedStart.indexOf('\n');
      out = nl === -1 ? '' : trimmedStart.slice(nl + 1);
      changed = true;
    } else if (trimmedStart.startsWith('/*')) {
      const end = trimmedStart.indexOf('*/');
      out = end === -1 ? '' : trimmedStart.slice(end + 2);
      changed = true;
    } else {
      out = trimmedStart;
    }
  }
  return out.trim();
}

// Strips a wrapping quote/backtick pair from an identifier, e.g. `foo`, "foo", 'foo' -> foo
function unquoteIdent(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '`' || first === '"' || first === "'") && first === last) {
      return t.slice(1, -1);
    }
  }
  return t;
}

// Regexes for the pseudo-statements we intercept before they hit sql.js
const RE_CREATE_DB = /^CREATE\s+(?:DATABASE|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?[\w-]+[`"']?)\s*;?\s*$/i;
const RE_DROP_DB = /^DROP\s+(?:DATABASE|SCHEMA)\s+(?:IF\s+EXISTS\s+)?([`"']?[\w-]+[`"']?)\s*;?\s*$/i;
const RE_USE_DB = /^USE\s+([`"']?[\w-]+[`"']?)\s*;?\s*$/i;
const RE_SHOW_DBS = /^SHOW\s+DATABASES\s*;?\s*$/i;
const RE_SHOW_TABLES = /^SHOW\s+(?:FULL\s+)?TABLES\s*;?\s*$/i;
const RE_DESCRIBE = /^(?:DESCRIBE|DESC)\s+([`"']?[\w-]+[`"']?)\s*;?\s*$/i;

export function SqlProvider({ children }: { children: React.ReactNode }) {
  const sqlRef = useRef<SqlJsStatic | null>(null);
  // All in-memory databases, keyed by name
  const databasesRef = useRef<Map<string, Database>>(new Map());
  const dbRef = useRef<Database | null>(null); // the ACTIVE database
  const currentDbNameRef = useRef<string>(DEFAULT_DB_NAME);

  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [lastExecution, setLastExecution] = useState(0);
  const [currentDatabase, setCurrentDatabase] = useState(DEFAULT_DB_NAME);
  const [databases, setDatabases] = useState<string[]>([DEFAULT_DB_NAME]);

  const syncDatabaseList = useCallback(() => {
    setDatabases(Array.from(databasesRef.current.keys()));
  }, []);

  useEffect(() => {
    loadSqlJsFromCDN()
      .then(initSqlJs => initSqlJs({
        locateFile: (file: string) =>
          `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`,
      }))
      .then((SQL: SqlJsStatic) => {
        sqlRef.current = SQL;
        const db = new SQL.Database();
        databasesRef.current.set(DEFAULT_DB_NAME, db);
        dbRef.current = db;
        currentDbNameRef.current = DEFAULT_DB_NAME;
        syncDatabaseList();
        setReady(true);
      })
      .catch((e: Error) => {
        console.error('sql.js init error:', e);
        setInitError(String(e));
      });
  }, [syncDatabaseList]);

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

  // --- Database-management primitives (no SQL engine involvement) ---

  const createDatabase = useCallback((rawName: string) => {
    const SQL = sqlRef.current;
    if (!SQL) return;
    const name = unquoteIdent(rawName);
    if (databasesRef.current.has(name)) return; // IF NOT EXISTS semantics handled by caller
    const db = new SQL.Database();
    databasesRef.current.set(name, db);
    syncDatabaseList();
  }, [syncDatabaseList]);

  const useDatabase = useCallback((rawName: string): boolean => {
    const name = unquoteIdent(rawName);
    const db = databasesRef.current.get(name);
    if (!db) return false;
    dbRef.current = db;
    currentDbNameRef.current = name;
    setCurrentDatabase(name);
    refreshSchema();
    setLastExecution(Date.now());
    return true;
  }, [refreshSchema]);

  const dropDatabase = useCallback((rawName: string): boolean => {
    const name = unquoteIdent(rawName);
    if (!databasesRef.current.has(name)) return false;
    if (databasesRef.current.size === 1) return false; // never drop the last database
    databasesRef.current.delete(name);
    syncDatabaseList();
    if (currentDbNameRef.current === name) {
      // fall back to whatever database is left
      const [fallbackName, fallbackDb] = Array.from(databasesRef.current.entries())[0];
      dbRef.current = fallbackDb;
      currentDbNameRef.current = fallbackName;
      setCurrentDatabase(fallbackName);
      refreshSchema();
    }
    setLastExecution(Date.now());
    return true;
  }, [refreshSchema, syncDatabaseList]);

  const execute = useCallback(async (rawSql: string): Promise<QueryResult> => {
    if (!dbRef.current) return { results: [], error: 'Database not ready', executionTime: 0 };

    const t0 = performance.now();
    const allResults: QueryExecResult[] = [];
    let affectedRowsTotal = 0;
    let lastMessage: string | undefined;

    try {
      const statements = rawSql.split(/;(?=(?:[^']*'[^']*')*[^']*$)/);

      for (let rawStmt of statements) {
        const trimmed = rawStmt.trim();
        if (!trimmed) continue;

        // --- Intercept database-management statements before they hit sql.js ---
        // Strip leading comments so a `-- note` line above CREATE/USE/DROP DATABASE
        // doesn't prevent the match (comments don't end a statement, so they land
        // in the same chunk as the SQL that follows them).
        const forMatch = stripLeadingComments(trimmed);
        let m: RegExpMatchArray | null;

        if (!forMatch) continue; // statement was comments only

        if ((m = forMatch.match(RE_CREATE_DB))) {
          const name = unquoteIdent(m[1]);
          const ifNotExists = /IF\s+NOT\s+EXISTS/i.test(trimmed);
          if (databasesRef.current.has(name)) {
            if (!ifNotExists) {
              const executionTime = performance.now() - t0;
              const entry: HistoryEntry = { id: crypto.randomUUID(), query: trimmed.slice(0, 200), timestamp: new Date(), success: false, executionTime };
              setHistory(h => [entry, ...h].slice(0, 200));
              setLastExecution(Date.now());
              return { results: allResults, error: `database "${name}" already exists`, executionTime };
            }
          } else {
            createDatabase(name);
          }
          lastMessage = `Database '${name}' created.`;
          continue;
        }

        if ((m = forMatch.match(RE_DROP_DB))) {
          const name = unquoteIdent(m[1]);
          const ifExists = /IF\s+EXISTS/i.test(trimmed);
          const ok = dropDatabase(name);
          if (!ok && !ifExists) {
            const executionTime = performance.now() - t0;
            const reason = databasesRef.current.size === 1
              ? `cannot drop database "${name}": it is the only database`
              : `database "${name}" does not exist`;
            const entry: HistoryEntry = { id: crypto.randomUUID(), query: trimmed.slice(0, 200), timestamp: new Date(), success: false, executionTime };
            setHistory(h => [entry, ...h].slice(0, 200));
            setLastExecution(Date.now());
            return { results: allResults, error: reason, executionTime };
          }
          lastMessage = `Database '${name}' dropped.`;
          continue;
        }

        if ((m = forMatch.match(RE_USE_DB))) {
          const name = unquoteIdent(m[1]);
          const ok = useDatabase(name);
          if (!ok) {
            const executionTime = performance.now() - t0;
            const entry: HistoryEntry = { id: crypto.randomUUID(), query: trimmed.slice(0, 200), timestamp: new Date(), success: false, executionTime };
            setHistory(h => [entry, ...h].slice(0, 200));
            setLastExecution(Date.now());
            return { results: allResults, error: `unknown database "${name}"`, executionTime };
          }
          lastMessage = `Database changed to '${name}'.`;
          continue;
        }

        if (RE_SHOW_DBS.test(forMatch)) {
          allResults.push({
            columns: ['Database'],
            values: Array.from(databasesRef.current.keys()).map(n => [n]),
          });
          continue;
        }

        if (RE_SHOW_TABLES.test(forMatch)) {
          try {
            const res = dbRef.current.exec(
              `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
            );
            const values = res[0]?.values ?? [];
            allResults.push({
              columns: [`Tables_in_${currentDbNameRef.current}`],
              values,
            });
          } catch (e: any) {
            const executionTime = performance.now() - t0;
            return { results: allResults, error: String(e), executionTime };
          }
          continue;
        }

        if ((m = forMatch.match(RE_DESCRIBE))) {
          const tname = unquoteIdent(m[1]);
          try {
            const colRes = dbRef.current.exec(`PRAGMA table_info("${tname}")`);
            const rows = colRes[0]?.values ?? [];
            if (rows.length === 0) {
              const executionTime = performance.now() - t0;
              const entry: HistoryEntry = { id: crypto.randomUUID(), query: trimmed.slice(0, 200), timestamp: new Date(), success: false, executionTime };
              setHistory(h => [entry, ...h].slice(0, 200));
              setLastExecution(Date.now());
              return { results: allResults, error: `table "${tname}" does not exist`, executionTime };
            }
            allResults.push({
              columns: ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'],
              values: rows.map((c: Array<string | number | null>) => [
                c[1] as string,
                (c[2] as string) || 'TEXT',
                (c[3] as number) === 1 ? 'NO' : 'YES',
                (c[5] as number) > 0 ? 'PRI' : '',
                c[4] as string | null,
                (c[5] as number) > 0 && ((c[2] as string) || '').toUpperCase().includes('INT') ? 'AUTOINCREMENT' : '',
              ]),
            });
          } catch (e: any) {
            const executionTime = performance.now() - t0;
            return { results: allResults, error: String(e), executionTime };
          }
          continue;
        }
        // --- End interception ---

        const sql = translateMySqlToSqlite(trimmed);
        try {
          const res = dbRef.current.exec(sql);
          if (res.length > 0) allResults.push(...res);

          if (
            sql.toUpperCase().startsWith('INSERT') ||
            sql.toUpperCase().startsWith('UPDATE') ||
            sql.toUpperCase().startsWith('DELETE')
          ) {
            try {
              const r = dbRef.current.exec('SELECT changes()');
              affectedRowsTotal += (r[0]?.values?.[0]?.[0] as number) || 0;
            } catch { }
          }
        } catch (e: any) {
          const executionTime = performance.now() - t0;
          const errMsg = e instanceof Error ? e.message : String(e);
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
      return { results: allResults, affectedRows: affectedRowsTotal, executionTime, message: lastMessage };
    } catch (e: any) {
      const executionTime = performance.now() - t0;
      return { results: [], error: String(e), executionTime };
    }
  }, [refreshSchema, createDatabase, dropDatabase, useDatabase]);

  const query = useCallback((sql: string): QueryExecResult[] => {
    const db = dbRef.current;
    if (!db) return [];
    return db.exec(sql);
  }, []);

  const exportDb = useCallback((): Uint8Array | null => {
    return dbRef.current?.export() ?? null;
  }, []);

  const importDb = useCallback(async (data: Uint8Array, name?: string) => {
    const SQL = sqlRef.current;
    if (SQL) {
      const targetName = name ? unquoteIdent(name) : currentDbNameRef.current;
      const db = new SQL.Database(data);
      databasesRef.current.set(targetName, db);
      dbRef.current = db;
      currentDbNameRef.current = targetName;
      setCurrentDatabase(targetName);
      syncDatabaseList();
      setLastExecution(Date.now());
      refreshSchema();
    }
  }, [refreshSchema, syncDatabaseList]);

  const clearHistory = useCallback(() => setHistory([]), []);

  return (
    <SqlContext.Provider value={{
      db: dbRef.current, ready, initError,
      history, schema, lastExecution, currentDatabase, databases,
      execute, query, exportDb, importDb, refreshSchema, clearHistory,
      createDatabase, useDatabase, dropDatabase,
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
