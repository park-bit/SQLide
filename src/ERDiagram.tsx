import { useMemo } from 'react';
import type { SchemaTable } from './SqlContext';

interface ERDiagramProps {
  schema: SchemaTable[];
}

const TABLE_W = 200;
const COL_H = 24;
const HEADER_H = 36;
const PADDING = 60;

function getTableHeight(t: SchemaTable) {
  return HEADER_H + t.columns.length * COL_H + 8;
}

function layoutTables(tables: SchemaTable[]) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  return tables.map((t, i) => ({
    table: t,
    x: PADDING + (i % cols) * (TABLE_W + PADDING * 2),
    y: PADDING + Math.floor(i / cols) * (getTableHeight(t) + PADDING),
  }));
}

function typeColor(type: string) {
  if (type.includes('INT')) return '#60a5fa';
  if (type.includes('TEXT') || type.includes('VARCHAR') || type.includes('CHAR')) return '#86efac';
  if (type.includes('REAL') || type.includes('FLOAT') || type.includes('DOUBLE')) return '#fbbf24';
  if (type.includes('DATE') || type.includes('TIME')) return '#f9a8d4';
  return '#94a3b8';
}

export default function ERDiagram({ schema }: ERDiagramProps) {
  const layout = useMemo(() => layoutTables(schema), [schema]);

  if (schema.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 12,
        color: 'var(--text-muted)', fontSize: 13
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity={0.3}>
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
          <line x1="10" y1="6.5" x2="14" y2="6.5"/>
          <line x1="6.5" y1="10" x2="6.5" y2="14"/>
        </svg>
        <span>Create tables to see the ER diagram</span>
        <span style={{ fontSize: 11 }}>Foreign key relationships will appear as lines</span>
      </div>
    );
  }

  const totalW = layout.reduce((m, n) => Math.max(m, n.x + TABLE_W + PADDING), 800);
  const totalH = layout.reduce((m, n) => Math.max(m, n.y + getTableHeight(n.table) + PADDING), 600);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#090a0f', position: 'relative' }}>
      <svg
        width={totalW} height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ 
          display: 'block', 
          minWidth: '100%', 
          minHeight: '100%',
          transformOrigin: '0 0'
        }}
      >
        <defs>
          <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="1" fill="#1a1b26" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        {layout.map(({ table, x, y }) => {
          return table.foreignKeys.map((fk, fki) => {
            const target = layout.find(l => l.table.name === fk.refTable);
            if (!target) return null;

            const ci1 = table.columns.findIndex(c => c.name === fk.column);
            const ci2 = target.table.columns.findIndex(c => c.name === fk.refColumn);
            
            const startX = x < target.x ? x + TABLE_W : x;
            const startY = y + HEADER_H + (ci1 >= 0 ? ci1 * COL_H : 0) + COL_H / 2;
            const endX = x < target.x ? target.x : target.x + TABLE_W;
            const endY = target.y + HEADER_H + (ci2 >= 0 ? ci2 * COL_H : 0) + COL_H / 2;

            const cp1x = x < target.x ? startX + 40 : startX - 40;
            const cp2x = x < target.x ? endX - 40 : endX + 40;

            return (
              <path
                key={`${table.name}-${fk.column}-${fki}`}
                d={`M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`}
                fill="none"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.8}
                markerEnd="url(#arrow)"
              />
            );
          });
        })}
        {layout.map(({ table, x, y }) => {
          const h = getTableHeight(table);
          return (
            <g key={table.name}>
              <rect x={x + 3} y={y + 3} width={TABLE_W} height={h} rx={8} fill="rgba(0,0,0,0.4)" />

              {/* Card */}
              <rect x={x} y={y} width={TABLE_W} height={h} rx={8}
                fill="var(--bg-elevated)" stroke="#a78bfa" strokeWidth={1.5} />

              <rect x={x} y={y} width={TABLE_W} height={h} rx={8}
                fill="var(--bg-elevated)" stroke="#a78bfa" strokeWidth={1.5} />
              <rect x={x} y={y} width={TABLE_W} height={HEADER_H} rx={8} fill="#1e1535" />
              <rect x={x} y={y + HEADER_H - 8} width={TABLE_W} height={8} fill="#1e1535" />
              <text x={x + 10} y={y + 23} fontSize={14}>🗄️</text>
              <text x={x + 30} y={y + 23}
                fontSize={13} fontWeight="700"
                fill="#a78bfa" fontFamily="JetBrains Mono, monospace">
                {table.name.length > 16 ? table.name.slice(0, 15) + '…' : table.name}
              </text>
              {table.rowCount !== undefined && (
                <text x={x + TABLE_W - 8} y={y + 23} textAnchor="end"
                  fontSize={10} fill="#565970" fontFamily="JetBrains Mono, monospace">
                  {table.rowCount} rows
                </text>
              )}
              {table.columns.map((col, ci) => {
                const cy2 = y + HEADER_H + 4 + ci * COL_H;
                const isEven = ci % 2 === 0;
                return (
                  <g key={col.name}>
                    {isEven && (
                      <rect x={x + 1} y={cy2} width={TABLE_W - 2} height={COL_H}
                        fill="rgba(255,255,255,0.02)" rx={0} />
                    )}
                    {col.pk && (
                      <rect x={x + 1} y={cy2} width={3} height={COL_H} fill="#fbbf24" />
                    )}
                    <text x={x + 10} y={cy2 + 16} fontSize={11}>
                      {col.pk ? '🔑' : table.foreignKeys.some(fk => fk.column === col.name) ? '🔗' : '○'}
                    </text>
                    <text x={x + 26} y={cy2 + 16} fontSize={11}
                      fill={col.pk ? '#fbbf24' : table.foreignKeys.some(fk => fk.column === col.name) ? '#6366f1' : '#cbd5e1'}
                      fontFamily="JetBrains Mono, monospace" fontWeight={col.pk || table.foreignKeys.some(fk => fk.column === col.name) ? '600' : '400'}>
                      {col.name.length > 14 ? col.name.slice(0, 13) + '…' : col.name}
                    </text>
                    <rect x={x + TABLE_W - 62} y={cy2 + 4} width={58} height={15} rx={3}
                      fill="rgba(0,0,0,0.3)" />
                    <text x={x + TABLE_W - 33} y={cy2 + 15} fontSize={9}
                      fill={typeColor(col.type)} textAnchor="middle"
                      fontFamily="JetBrains Mono, monospace">
                      {col.type.length > 8 ? col.type.slice(0, 7) + '…' : col.type}
                    </text>
                    {col.notNull && !col.pk && (
                      <>
                        <rect x={x + TABLE_W - 26} y={cy2 + 4} width={18} height={15} rx={2} fill="rgba(248,113,113,0.2)" />
                        <text x={x + TABLE_W - 17} y={cy2 + 15} fontSize={8}
                          fill="#f87171" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700">
                          NN
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
              <rect x={x} y={y + h - 1} width={TABLE_W} height={1} fill="#a78bfa40" />
            </g>
          );
        })}
      </svg>
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', padding: '8px 12px',
        fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4
      }}>
        <div style={{ fontWeight: 600, marginBottom: 2, color: 'var(--text-secondary)' }}>Legend</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>🔑</span><span>Primary Key</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>🔗</span><span>Foreign Key</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontSize: 10 }}>INT</span><span>Integer type</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#86efac', fontFamily: 'monospace', fontSize: 10 }}>TEXT</span><span>Text type</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#f87171', fontFamily: 'monospace', fontSize: 10 }}>NN</span><span>Not Null</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 16, height: 1.5, background: '#6366f1', display: 'inline-block', borderStyle: 'dashed' }}></span><span>Foreign Key</span>
        </div>
      </div>
    </div>
  );
}
