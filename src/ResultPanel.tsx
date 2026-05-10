import { useState, useCallback, useEffect } from 'react';
import ERDiagram from './ERDiagram';
import type { QueryExecResult, LogEntry, SchemaTable, HistoryEntry } from './SqlContext';

interface ResultPanelProps {
  results: QueryExecResult[];
  error?: string;
  executionTime?: number;
  affectedRows?: number;
  log: LogEntry[];
  schema: SchemaTable[];
  history: HistoryEntry[];
  onClearHistory: () => void;
  onRunHistory: (q: string) => void;
  forcedTab?: string | null;
}



type OutputTab = 'results' | 'console' | 'schema' | 'history' | 'diagram';

function fmt(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ResultTable({ result, idx }: { result: QueryExecResult; idx: number }) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;
  const totalPages = Math.ceil(result.values.length / PAGE_SIZE);
  const rows = result.values.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ marginBottom: 16 }}>
      {idx > 0 && (
        <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
          Result Set {idx + 1}
        </div>
      )}
      <div className="result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th style={{ width: 48, textAlign: 'right', color: 'var(--text-muted)' }}>#</th>
              {result.columns.map(col => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 11, userSelect: 'none' }}>
                  {page * PAGE_SIZE + ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td key={ci}>
                    {cell === null
                      ? <span className="null-value">NULL</span>
                      : String(cell)
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹ Prev</button>
          <span>Page {page + 1} / {totalPages} &nbsp;·&nbsp; {result.values.length.toLocaleString()} rows</span>
          <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>Next ›</button>
        </div>
      )}
    </div>
  );
}

export function exportCSV(result: QueryExecResult): void {
  const rows = [result.columns, ...result.values.map(row => row.map(c => c === null ? '' : String(c)))];
  const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'result.csv'; a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(result: QueryExecResult): void {
  const data = result.values.map(row => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'result.json'; a.click();
  URL.revokeObjectURL(url);
}

export default function ResultPanel({
  results, error, executionTime, affectedRows,
  log, schema, history, onClearHistory, onRunHistory, forcedTab
}: ResultPanelProps) {
  const [activeTab, setActiveTab] = useState<OutputTab>('results');

  
  useEffect(() => {
    if (forcedTab) setActiveTab(forcedTab as OutputTab);
  }, [forcedTab]);

  const [openTables, setOpenTables] = useState<Set<string>>(new Set());

  const totalRows = results.reduce((sum, r) => sum + r.values.length, 0);

  const toggleTable = useCallback((name: string) => {
    setOpenTables(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  
  const errorCount = log.filter(l => l.level === 'error').length;

  return (
    <div className="output-panel" style={{ height: '100%' }}>
      <div className="output-tabs">
        <button className={`output-tab ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
          Results
          {results.length > 0 && (
            <span className="output-count">{totalRows.toLocaleString()}</span>
          )}
        </button>
        <button className={`output-tab ${activeTab === 'console' ? 'active' : ''}`} onClick={() => setActiveTab('console')}>
          Console
          {errorCount > 0 && (
            <span className="output-count" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>{errorCount}</span>
          )}
        </button>
        <button className={`output-tab ${activeTab === 'schema' ? 'active' : ''}`} onClick={() => setActiveTab('schema')}>
          Schema
          {schema.length > 0 && <span className="output-count">{schema.length}</span>}
        </button>
        <button className={`output-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          History
          {history.length > 0 && <span className="output-count">{history.length}</span>}
        </button>
        <button className={`output-tab ${activeTab === 'diagram' ? 'active' : ''}`} onClick={() => setActiveTab('diagram')}>
          ER Diagram
        </button>


        {}
        {activeTab === 'results' && results.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => exportCSV(results[0])}>↓ CSV</button>
            <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => exportJSON(results[0])}>↓ JSON</button>
          </div>
        )}
        {activeTab === 'history' && history.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }} onClick={onClearHistory}>Clear</button>
          </div>
        )}
      </div>

      <div className="output-body">
        {}
        {activeTab === 'results' && (
          <div className="result-container">
            {(executionTime !== undefined) && (
              <div className="result-meta">
                {error ? (
                  <span className="result-badge error">✗ Error</span>
                ) : (
                  <span className="result-badge success">✓ OK</span>
                )}
                {executionTime !== undefined && <span>⏱ {fmt(executionTime)}</span>}
                {!error && results.length > 0 && <span>{totalRows.toLocaleString()} row{totalRows !== 1 ? 's' : ''}</span>}
                {affectedRows !== undefined && <span>{affectedRows} row{affectedRows !== 1 ? 's' : ''} affected</span>}
              </div>
            )}

            {error && <div className="error-block">{error}</div>}
            {!error && results.length === 0 && executionTime !== undefined && (
              <div className="success-block">
                Query executed successfully.{affectedRows !== undefined ? ` ${affectedRows} row(s) affected.` : ''}
              </div>
            )}
            {!error && results.map((r, i) => <ResultTable key={i} result={r} idx={i} />)}
            {executionTime === undefined && (
              <div className="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <div>Run a query to see results here</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Press Ctrl+Enter or click Run</div>
              </div>
            )}
          </div>
        )}

        {}
        {activeTab === 'console' && (
          <div className="console-body animate-in">
            {log.length === 0 ? (
              <div className="empty-state">
                <span>No console output yet</span>
              </div>
            ) : (
              log.map((entry, i) => (
                <div key={i} className={`log-${entry.level}`}>
                  <span className="log-ts">[{fmtTime(entry.timestamp)}]</span>
                  {entry.message}
                </div>
              ))
            )}
          </div>
        )}

        {}
        {activeTab === 'schema' && (
          <div className="schema-tree animate-in">
            {schema.length === 0 ? (
              <div className="empty-state">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
                <span>No tables yet. Create one to see the schema.</span>
              </div>
            ) : schema.map(table => (
              <div key={table.name} className="schema-table">
                <div className="schema-table__name" onClick={() => toggleTable(table.name)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chevron" style={{ transform: openTables.has(table.name) ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  <span style={{ color: '#a78bfa' }}>{table.name}</span>
                  {table.rowCount !== undefined && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {table.rowCount} rows
                    </span>
                  )}
                </div>
                {openTables.has(table.name) && (
                  <div className="schema-table__columns">
                    {table.columns.map(col => (
                      <div key={col.name} className="schema-column">
                        {col.pk ? (
                          <span style={{ color: 'var(--warning)', fontSize: 10 }}>🔑</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>○</span>
                        )}
                        <span style={{ color: 'var(--text-secondary)' }}>{col.name}</span>
                        <span className="schema-column__type">{col.type}</span>
                        {col.notNull && <span style={{ fontSize: 9, color: 'var(--error)', background: 'var(--error-subtle)', padding: '0 4px', borderRadius: 3 }}>NN</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {}
        {activeTab === 'history' && (
          <div className="history-list animate-in">
            {history.length === 0 ? (
              <div className="empty-state"><span>No query history yet</span></div>
            ) : history.map(item => (
              <div key={item.id} className="history-item" onClick={() => onRunHistory(item.query)}>
                <div className="history-item__query">{item.query}</div>
                <div className="history-item__meta">
                  <span style={{ color: item.success ? 'var(--success)' : 'var(--error)' }}>
                    {item.success ? '✓' : '✗'}
                  </span>
                  <span>{fmtTime(item.timestamp)}</span>
                  <span>{fmt(item.executionTime)}</span>
                  {item.rowCount !== undefined && <span>{item.rowCount} rows</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {}
        {activeTab === 'diagram' && (
          <div style={{ height: '100%', overflow: 'hidden' }}>
            <ERDiagram schema={schema} />
          </div>
        )}
      </div>
    </div>

  );
}
