import { useState, useEffect } from 'react';
import { useSql } from './SqlContext';
import type { QueryExecResult } from './SqlContext';

interface TableDataViewerProps {
  tableName: string | null;
  onClose: () => void;
}

const PAGE_SIZE = 50;

export default function TableDataViewer({ tableName, onClose }: TableDataViewerProps) {
  const { query, schema, lastExecution } = useSql();
  const [data, setData] = useState<QueryExecResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [error, setError] = useState<string | null>(null);

  const tableInfo = schema.find(t => t.name === tableName);

  useEffect(() => { setPage(0); setSortCol(null); setSortDir('ASC'); }, [tableName]);

  useEffect(() => {
    if (!tableName) return;
    setLoading(true);
    setError(null);
    try {
      const order = sortCol ? ` ORDER BY "${sortCol}" ${sortDir}` : '';
      const res = query(`SELECT * FROM "${tableName}"${order};`);
      setData(res[0] ?? { columns: [], values: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tableName, sortCol, sortDir, query, lastExecution]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    else { setSortCol(col); setSortDir('ASC'); }
  };

  if (!tableName) return null;

  const rows = data?.values ?? [];
  const cols = data?.columns ?? [];
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)', flexShrink: 0
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#a78bfa' }}>
          {tableName}
        </span>
        {tableInfo && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
            ({tableInfo.columns.length} cols · {tableInfo.rowCount ?? '?'} rows)
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {loading && <div className="spinner" style={{ width: 12, height: 12, borderTopColor: 'var(--accent)' }} />}
          <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }}
            onClick={() => { setSortCol(null); setSortDir('ASC'); }}>
            Reset Sort
          </button>
          <button className="btn-icon" onClick={onClose} title="Close viewer" style={{ color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {}
      {tableInfo && (
        <div style={{
          display: 'flex', gap: 8, padding: '6px 12px', flexShrink: 0,
          background: 'var(--bg-base)', borderBottom: '1px solid var(--border)',
          overflowX: 'auto'
        }}>
          {tableInfo.columns.map(col => (
            <div key={col.name} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              flexShrink: 0, minWidth: 80, cursor: 'pointer',
              borderColor: sortCol === col.name ? 'var(--accent)' : 'var(--border)'
            }}
              onClick={() => handleSort(col.name)}
              title={`Sort by ${col.name}`}
            >
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {col.pk ? '🔑' : '○'} {col.type}
              </span>
              <span style={{
                fontSize: 11.5, color: col.pk ? '#fbbf24' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)', fontWeight: 500
              }}>
                {col.name}
              </span>
              {sortCol === col.name && (
                <span style={{ fontSize: 9, color: 'var(--accent)' }}>
                  {sortDir === 'ASC' ? '↑ ASC' : '↓ DESC'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {}
      {error && (
        <div className="error-block" style={{ margin: 12 }}>{error}</div>
      )}

      {}
      {!error && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {rows.length === 0 && !loading ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity={0.3}>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                <path d="M9 3v18" opacity={0.5}/>
              </svg>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 8 }}>Table is empty</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 200, marginTop: 4 }}>
                Run an <code style={{ color: 'var(--accent)' }}>INSERT</code> query to add data to this table.
              </div>
              <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => {
                try {
                  const res = query(`SELECT * FROM "${tableName}" LIMIT 10;`);
                  setData(res[0] ?? data);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}>
                Refresh Data
              </button>
            </div>
          ) : (
            <table style={{
              width: 'max-content', minWidth: '100%', borderCollapse: 'collapse',
              fontFamily: 'var(--font-mono)', fontSize: 12.5
            }}>
              <thead>
                <tr>
                  <th style={{
                    width: 40, padding: '8px 12px', background: 'var(--bg-elevated)',
                    textAlign: 'right', color: 'var(--text-muted)', fontSize: 10,
                    position: 'sticky', top: 0, zIndex: 1, borderBottom: '2px solid var(--border)'
                  }}>#</th>
                  {cols.map(col => (
                    <th key={col}
                      onClick={() => handleSort(col)}
                      style={{
                        padding: '8px 16px', textAlign: 'left', whiteSpace: 'nowrap',
                        background: sortCol === col ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                        color: sortCol === col ? 'var(--accent)' : 'var(--text-muted)',
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px',
                        cursor: 'pointer', userSelect: 'none',
                        position: 'sticky', top: 0, zIndex: 1,
                        borderBottom: '2px solid var(--border)',
                        transition: 'background 0.12s'
                      }}
                    >
                      {col} {sortCol === col ? (sortDir === 'ASC' ? '↑' : '↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, ri) => (
                  <tr key={ri} style={{ cursor: 'default' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 11, borderBottom: '1px solid var(--border)', userSelect: 'none' }}>
                      {page * PAGE_SIZE + ri + 1}
                    </td>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '6px 16px', borderBottom: '1px solid var(--border)',
                        color: cell === null ? 'var(--text-muted)' : 'var(--text-primary)',
                        fontStyle: cell === null ? 'italic' : 'normal',
                        maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }} title={cell === null ? 'NULL' : String(cell)}>
                        {cell === null ? 'NULL' : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderTop: '1px solid var(--border)',
          flexShrink: 0, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)'
        }}>
          <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }}
            onClick={() => setPage(0)} disabled={page === 0}>«</button>
          <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }}
            onClick={() => setPage(p => p - 1)} disabled={page === 0}>‹</button>
          <span style={{ flex: 1, textAlign: 'center' }}>
            Page {page + 1} / {totalPages} · {rows.length.toLocaleString()} rows total
          </span>
          <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }}
            onClick={() => setPage(p => p + 1)} disabled={page === totalPages - 1}>›</button>
          <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }}
            onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1}>»</button>
        </div>
      )}
    </div>
  );
}
