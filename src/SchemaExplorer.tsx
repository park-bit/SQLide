import { useState, useCallback } from 'react';
import { useSql } from './SqlContext';

interface ContextMenu {
  x: number; y: number;
  tableName: string;
}

interface SchemaExplorerProps {
  onQuery: (sql: string) => void;
  onViewData: (table: string) => void;
}

export default function SchemaExplorer({ onQuery, onViewData }: SchemaExplorerProps) {
  const { schema, refreshSchema } = useSql();
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [search, setSearch] = useState('');

  const toggleTable = useCallback((name: string) => {
    setOpenTables(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, tableName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tableName });
  }, []);

  const closeContext = useCallback(() => setContextMenu(null), []);

  const filtered = schema.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const typeColor = (type: string) => {
    if (type.includes('INT')) return '#60a5fa';
    if (type.includes('TEXT') || type.includes('VARCHAR') || type.includes('CHAR')) return '#86efac';
    if (type.includes('REAL') || type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('NUMERIC') || type.includes('DECIMAL')) return '#fbbf24';
    if (type.includes('DATE') || type.includes('TIME')) return '#f9a8d4';
    if (type.includes('BOOL')) return '#a78bfa';
    return '#94a3b8';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} onClick={closeContext}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)' }}>
          Database Explorer
        </span>
        <button className="btn-icon" onClick={refreshSchema} title="Refresh schema">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      {}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '4px 8px'
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter tables..."
            style={{
              background: 'none', border: 'none', outline: 'none', flex: 1,
              fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)'
            }}
          />
        </div>
      </div>

      {}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', fontSize: 11, fontWeight: 600,
            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px'
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sidebar-icon)" strokeWidth="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            Tables ({filtered.length})
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              {schema.length === 0
                ? 'No tables yet. Run a CREATE TABLE statement.'
                : 'No tables match your search.'}
            </div>
          )}

          {filtered.map(table => (
            <div key={table.name}>
              <div
                onContextMenu={e => handleContextMenu(e, table.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 0,
                  padding: '5px 0 5px 12px', cursor: 'pointer',
                  transition: 'background 0.12s',
                  borderLeft: openTables.has(table.name)
                    ? '2px solid #a78bfa' : '2px solid transparent',
                  background: openTables.has(table.name) ? 'var(--bg-elevated)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = openTables.has(table.name) ? 'var(--bg-elevated)' : 'transparent')}
              >
                <button
                  onClick={() => toggleTable(table.name)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    padding: '2px 4px', flexShrink: 0
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ transform: openTables.has(table.name) ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                {table.type === 'view' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" style={{ flexShrink: 0, marginRight: 6 }}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" style={{ flexShrink: 0, marginRight: 6 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                )}
                <span
                  style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500, flex: 1, fontFamily: 'var(--font-mono)' }}
                  onClick={() => onViewData(table.name)}
                >
                  {table.name}
                </span>
                {table.rowCount !== undefined && (
                  <span style={{
                    fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-overlay)',
                    padding: '1px 6px', borderRadius: 99, marginRight: 8, fontFamily: 'var(--font-mono)'
                  }}>
                    {table.rowCount}
                  </span>
                )}
              </div>
              {openTables.has(table.name) && (
                <div style={{ borderLeft: '2px solid #a78bfa20', marginLeft: 22 }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '14px 1fr auto auto',
                    gap: 6, padding: '4px 8px 4px 12px',
                    fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <span/>
                    <span>Column</span>
                    <span>Type</span>
                    <span>Flags</span>
                  </div>

                  {table.columns.map(col => (
                    <div key={col.name} style={{
                      display: 'grid', gridTemplateColumns: '14px 1fr auto auto',
                      gap: 6, padding: '4px 8px 4px 12px', alignItems: 'center',
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 10, textAlign: 'center', color: col.pk ? '#fbbf24' : 'var(--text-muted)' }}>
                        {col.pk ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3m-3-3l-2.5-2.5"/>
                          </svg>
                        ) : '○'}
                      </span>

                      {}
                      <span style={{ fontSize: 11.5, color: col.pk ? '#fbbf24' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col.name}
                      </span>

                      {}
                      <span style={{
                        fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
                        background: 'var(--bg-overlay)', color: typeColor(col.type),
                        fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap'
                      }}>
                        {col.type}
                      </span>

                      {}
                      <div style={{ display: 'flex', gap: 2 }}>
                        {col.pk && <span style={{ fontSize: 8, padding: '1px 3px', borderRadius: 2, background: '#fbbf2420', color: '#fbbf24', fontWeight: 700 }}>PK</span>}
                        {col.notNull && !col.pk && <span style={{ fontSize: 8, padding: '1px 3px', borderRadius: 2, background: '#f8717120', color: '#f87171', fontWeight: 700 }}>NN</span>}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => onQuery(`SELECT * FROM ${table.name} LIMIT 100;`)}
                      style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 3,
                        background: 'var(--accent-subtle)', border: '1px solid rgba(79,142,247,0.3)',
                        color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                        transition: 'all 0.12s'
                      }}
                    >
                      SELECT *
                    </button>
                    <button
                      onClick={() => onViewData(table.name)}
                      style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 3,
                        background: 'var(--success-subtle)', border: '1px solid rgba(34,211,160,0.3)',
                        color: 'var(--success)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                        transition: 'all 0.12s'
                      }}
                    >
                      View Data
                    </button>
                    <button
                      onClick={() => onQuery(`DROP TABLE IF EXISTS ${table.name};`)}
                      style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 3,
                        background: 'var(--error-subtle)', border: '1px solid rgba(248,113,113,0.3)',
                        color: 'var(--error)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                        transition: 'all 0.12s'
                      }}
                    >
                      Drop
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {}
      <div style={{
        padding: '6px 12px', borderTop: '1px solid var(--border)', flexShrink: 0,
        fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          {schema.length} table{schema.length !== 1 ? 's' : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          {schema.reduce((s, t) => s + t.columns.length, 0)} columns
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          {schema.reduce((s, t) => s + (t.rowCount ?? 0), 0)} rows
        </div>
      </div>

      {}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
            padding: '4px 0', minWidth: 180
          }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { 
              label: 'Select Top 100', 
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
              action: () => onQuery(`SELECT * FROM ${contextMenu.tableName} LIMIT 100;`) 
            },
            { 
              label: 'Copy Table Name', 
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
              action: () => navigator.clipboard.writeText(contextMenu.tableName) 
            },
            { 
              label: 'View Data', 
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
              action: () => onViewData(contextMenu.tableName) 
            },
            { 
              label: 'Show Structure', 
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
              action: () => onQuery(`PRAGMA table_info(${contextMenu.tableName});`) 
            },
            { 
              label: 'Count Rows', 
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>,
              action: () => onQuery(`SELECT COUNT(*) as total_rows FROM ${contextMenu.tableName};`) 
            },
            { label: '━━━━━━━━━━━━', action: null },
            { 
              label: 'Drop Table', 
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
              action: () => onQuery(`DROP TABLE IF EXISTS ${contextMenu.tableName};`), 
              danger: true 
            },
          ].map((item, i) =>
            item.action === null ? (
              <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 8px', opacity: 0.5 }} />
            ) : (
              <button key={i} onClick={() => { item.action?.(); closeContext(); }} style={{
                display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 10,
                padding: '7px 14px', background: 'none', border: 'none',
                fontSize: 12.5, color: (item as {danger?: boolean}).danger ? 'var(--error)' : 'var(--text-secondary)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'background 0.1s'
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {(item as any).icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
