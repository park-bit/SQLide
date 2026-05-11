import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SpeedInsights } from "@vercel/speed-insights/react";
import './App.css';
import SqlEditor from './SqlEditor';
import ResultPanel from './ResultPanel';
import { SqlProvider, useSql } from './SqlContext';
import type { LogEntry, QueryExecResult } from './SqlContext';
import SchemaExplorer from './SchemaExplorer';
import ERDiagram from './ERDiagram';
import TableDataViewer from './TableDataViewer';

const SNIPPETS: Record<string, string> = {
  'New Query': `-- Fetching inspiration from Kanye West...
SELECT 'One moment...' AS message;`,

  'Create Table': `CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  email     TEXT    UNIQUE NOT NULL,
  age       INTEGER,
  created_at TEXT   DEFAULT (datetime('now'))
);`,

  'Sample Data': `-- Insert sample data
INSERT INTO users (name, email, age) VALUES
  ('Alice Johnson', 'alice@example.com', 28),
  ('Bob Smith',     'bob@example.com',   34),
  ('Carol White',   'carol@example.com', 22),
  ('David Lee',     'david@example.com', 41),
  ('Emma Davis',    'emma@example.com',  29);

SELECT * FROM users ORDER BY name;`,

  'Aggregations': `SELECT
  COUNT(*)               AS total_users,
  AVG(age)               AS avg_age,
  MIN(age)               AS min_age,
  MAX(age)               AS max_age,
  ROUND(AVG(age), 1)     AS avg_age_rounded
FROM users;`,

  'JOIN Example': `CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  product    TEXT NOT NULL,
  amount     REAL NOT NULL,
  ordered_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO orders (user_id, product, amount) VALUES
  (1, 'Laptop',  999.99),
  (1, 'Mouse',    29.99),
  (2, 'Keyboard', 79.99),
  (3, 'Monitor', 349.99);

SELECT u.name, o.product, o.amount
FROM users u
JOIN orders o ON u.id = o.user_id
ORDER BY u.name;`,
};
interface Tab {
  id: string;
  name: string;
  query: string;
}
function useResizer(initialPx: number, direction: 'bottom' | 'right') {
  const [size, setSize] = useState(initialPx);
  const [dragging, setDragging] = useState(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    startPos.current = direction === 'bottom' ? e.clientY : e.clientX;
    startSize.current = size;
    setDragging(true);
    e.preventDefault();
  }, [size, direction]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const currentPos = direction === 'bottom' ? e.clientY : e.clientX;
      const delta = startPos.current - currentPos;
      setSize(Math.max(100, Math.min(direction === 'bottom' ? 600 : 800, startSize.current + delta)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, direction]);

  return { size, dragging, onMouseDown };
}
function IDE() {
  const { execute, schema, history, clearHistory, exportDb, importDb, ready, initError } = useSql();

  const handleDownload = useCallback(() => {
    const data = exportDb();
    if (!data) return;
    const blob = new Blob([data as any], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'database.sqlite';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportDb]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const data = new Uint8Array(reader.result as ArrayBuffer);
      await importDb(data);
    };
    reader.readAsArrayBuffer(file);
  }, [importDb]);

  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', name: 'query_1.sql', query: SNIPPETS['New Query'] },
  ]);

  useEffect(() => {
    fetch('https://api.kanye.rest/')
      .then(r => r.json())
      .then(data => {
        const kanyeQuote = `-- "${data.quote}"\n-- ~Kanye West\n\nSELECT 'Welcome to SQLide' AS message, datetime('now') AS current_time;`;
        setTabs(prev => prev.map(t => 
          (t.id === '1' && t.query === SNIPPETS['New Query']) ? { ...t, query: kanyeQuote } : t
        ));
      })
      .catch(err => console.error('Kanye was not feeling it today:', err));
  }, []);

  const [activeTabId, setActiveTabId] = useState('1');

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

  const addTab = useCallback(() => {
    const id = crypto.randomUUID();
    const num = tabs.length + 1;
    setTabs(prev => [...prev, { id, name: `query_${num}.sql`, query: `-- New query\nSELECT 1;` }]);
    setActiveTabId(id);
  }, [tabs.length]);

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) return [{ id: '1', name: 'query_1.sql', query: SNIPPETS['New Query'] }];
      return next;
    });
    if (activeTabId === id) {
      setActiveTabId(() => {
        const idx = tabs.findIndex(t => t.id === id);
        const next = tabs.filter(t => t.id !== id);
        return next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? '1';
      });
    }
  }, [activeTabId, tabs]);

  const updateQuery = useCallback((val: string, autoRun = false) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, query: val } : t));
    if (autoRun) {
      setTimeout(() => {
        document.getElementById('btn-run')?.click();
      }, 50);
    }
  }, [activeTabId]);

  const [results, setResults] = useState<QueryExecResult[]>([]);
  const [execError, setExecError] = useState<string | undefined>();
  const [errorLine, setErrorLine] = useState<number | undefined>();
  const [execTime, setExecTime] = useState<number | undefined>();
  const [affectedRows, setAffectedRows] = useState<number | undefined>();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [browseResult, setBrowseResult] = useState<QueryExecResult | null>(null);
  const [browseTableName, setBrowseTableName] = useState<string | null>(null);

  const appendLog = useCallback((level: LogEntry['level'], message: string) => {
    setLog(prev => [...prev.slice(-499), { level, message, timestamp: new Date() }]);
  }, []);

  const handleBrowseTable = useCallback(async (name: string) => {
    setBrowseTableName(name);
    setResultTabTrigger('browse');
    setBrowseResult(null);
    const res = await execute(`SELECT * FROM "${name}" LIMIT 1000`);
    if (res.results.length > 0) {
      setBrowseResult(res.results[0]);
    }
  }, [execute]);

  const runQuery = useCallback(async () => {
    if (!ready || running) return;
    const query = activeTab.query.trim();
    if (!query) return;
    setRunning(true);
    setExecError(undefined);
    setErrorLine(undefined);
    appendLog('info', `Executing: ${query.slice(0, 120)}${query.length > 120 ? '...' : ''}`);
    try {
      const res = await execute(query);
      setResults(res.results);
      setExecError(res.error);
      setExecTime(res.executionTime);
      setAffectedRows(res.affectedRows);
      
      if (res.results.length > 0) {
        setResultTabTrigger('results');
      } else if (res.error) {
        setResultTabTrigger('console');
      } else {
        setResultTabTrigger('console');
      }

      if (res.error) {
        appendLog('error', `Error: ${res.error}`);
        const lineMatch = res.error.match(/approx\. line (\d+)/);
        if (lineMatch) {
          setErrorLine(parseInt(lineMatch[1]));
        }
      } else {
        const rowCount = res.results.reduce((s, r) => s + r.values.length, 0);
        const msg = res.results.length > 0
          ? `OK · ${rowCount} row(s) returned in ${res.executionTime.toFixed(1)}ms`
          : res.affectedRows !== undefined
          ? `OK · ${res.affectedRows} row(s) affected in ${res.executionTime.toFixed(1)}ms`
          : `OK · Query executed in ${res.executionTime.toFixed(1)}ms`;
        appendLog('ok', msg);
      }
    } finally {
      setRunning(false);
    }
  }, [ready, running, activeTab.query, execute, appendLog]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [minimap, setMinimap] = useState(false);

  const [outputPosition, setOutputPosition] = useState<'bottom' | 'right'>('bottom');
  const [viewingTable, setViewingTable] = useState<string | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'diagram'>('explorer');
  const [resultTabTrigger, setResultTabTrigger] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'noir'>(() => Math.random() > 0.5 ? 'noir' : 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasContent = tabs.some(t => {
        const q = t.query.trim();
        return q.length > 0 && q !== SNIPPETS['New Query'] && !q.includes('-- Fetching inspiration');
      });
      if (hasContent) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tabs]);

  const { size: outputHeight, dragging, onMouseDown } = useResizer(240, outputPosition);

  const loadSnippet = useCallback((name: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, query: SNIPPETS[name] } : t));
    setSnippetOpen(false);
  }, [activeTabId]);

  const loadHistory = useCallback((query: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, query } : t));
  }, [activeTabId]);

  const formatQuery = useCallback(() => {
    const keywords = ['SELECT','FROM','WHERE','JOIN','LEFT JOIN','RIGHT JOIN','INNER JOIN','ON','AND','OR','ORDER BY','GROUP BY','HAVING','LIMIT','OFFSET','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','DROP TABLE','ALTER TABLE'];
    let q = activeTab.query;
    keywords.forEach(kw => {
      q = q.replace(new RegExp(`\\b${kw}\\b`, 'gi'), '\n' + kw);
    });
    q = q.replace(/^\n/, '').replace(/\n\n+/g, '\n');
    updateQuery(q);
  }, [activeTab.query, updateQuery]);

  const shareUrl = `${window.location.origin}${window.location.pathname}?q=${btoa(encodeURIComponent(activeTab.query))}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      try {
        const decoded = decodeURIComponent(atob(q));
        setTabs(prev => prev.map((t, i) => i === 0 ? { ...t, query: decoded } : t));
      } catch {}
    }
  }, []);

  if (!ready && !initError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, color: 'var(--text-secondary)' }}>
        <div className="spinner" style={{ width: 28, height: 28, borderTopColor: 'var(--accent)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>Initializing SQL engine…</span>
      </div>
    );
  }

  if (initError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12, color: 'var(--error)' }}>
        <span>⚠ Failed to load SQL engine</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{initError}</span>
      </div>
    );
  }

  return (
    <div className={`app-shell layout-${outputPosition}`}>
      <nav className="topnav">
        <a href="/" className="topnav__logo">
          <div className="topnav__logo-icon">
            <img src="/logo.svg" alt="SQLide" style={{ width: 24, height: 24, borderRadius: 4, display: 'block' }} />
          </div>
          <span className="topnav__logo-name">SQL<span>ide</span></span>
        </a>
        <div className="topnav__divider" />

        <div className="topnav__tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              className={`topnav__tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {tab.name}
            <span
              className="topnav__tab-close"
              role="button"
              tabIndex={0}
              onClick={e => closeTab(tab.id, e as unknown as React.MouseEvent)}
              onKeyDown={e => e.key === 'Enter' && closeTab(tab.id, e as unknown as React.MouseEvent)}
              aria-label="Close tab"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </span>

            </button>
          ))}
          <button className="topnav__new-tab" onClick={addTab} title="New tab" aria-label="New tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="topnav__actions">
          <button id="btn-snippets" className="btn btn-ghost" onClick={() => setSnippetOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            Snippets
          </button>
          <button id="btn-format" className="btn btn-ghost" onClick={formatQuery} title="Format SQL">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>
              <line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>
            </svg>
          </button>
          
          <div className="topnav__divider" />
          
          <button 
            className={`btn btn-ghost ${outputPosition === 'bottom' ? 'active' : ''}`} 
            onClick={() => setOutputPosition('bottom')} title="Output at bottom"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
            </svg>
          </button>
          <button 
            className={`btn btn-ghost ${outputPosition === 'right' ? 'active' : ''}`} 
            onClick={() => setOutputPosition('right')} title="Output at right"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="13" y1="3" x2="13" y2="21"/>
            </svg>
          </button>

          <div className="topnav__divider" />

          <button id="btn-share" className="btn btn-ghost" onClick={() => setShareOpen(true)} title="Share">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          <label className="btn btn-ghost" title="Upload Database (.sqlite)" style={{ cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <input type="file" accept=".sqlite,.db" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button id="btn-download" className="btn btn-ghost" onClick={handleDownload} title="Download Database (.sqlite)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button id="btn-settings" className="btn btn-ghost" onClick={() => setSettingsOpen(true)} title="Settings">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          
          <a 
            href="https://www.chai4.me/park-bit" 
            target="_blank" 
            rel="noopener noreferrer"
            className="support-btn-badge"
            title="Support park-bit on Chai4Me"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)',
              padding: '0 14px',
              borderRadius: '20px',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              transition: 'all 0.2s',
              marginRight: '8px',
              height: '32px'
            }}
          >
            <img src="https://chai4.me/icons/wordmark.png" alt="Chai4Me" style={{ height: 16, objectFit: 'contain', marginRight: '8px', filter: 'brightness(0) invert(1)' }} />
            <span style={{ color: '#cbd5e1', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: '600' }}>@park-bit</span>
          </a>

          <button
            id="btn-run"
            className={`btn btn-run ${running ? 'running' : ''}`}
            onClick={runQuery}
            disabled={running || !ready}
          >
            {running ? <><span className="spinner" />Running…</> : <>▶ Run</>}
          </button>
        </div>
      </nav>

      <div className={`content-area pos-${outputPosition}`}>
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar__tabs">
              <button 
                className={`sidebar__tab ${activeSidebarTab === 'explorer' ? 'active' : ''}`}
                onClick={() => setActiveSidebarTab('explorer')}
              >
                Explorer
              </button>
              <button 
                className={`sidebar__tab ${activeSidebarTab === 'diagram' ? 'active' : ''}`}
                onClick={() => setActiveSidebarTab('diagram')}
              >
                ER Diagram
              </button>
              <button className="btn-icon" style={{ marginLeft: 'auto' }} onClick={() => setSidebarOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            <div className="sidebar__body">
              {activeSidebarTab === 'explorer' ? (
                <SchemaExplorer 
                  onQuery={(q) => updateQuery(q, true)} 
                  onViewData={handleBrowseTable} 
                />
              ) : (
                <div style={{ height: '100%', overflow: 'auto', background: '#090a0f' }}>
                  <div style={{ 
                    transform: 'scale(0.5)', 
                    transformOrigin: '0 0', 
                    width: '200%', 
                    height: '200%' 
                  }}>
                    <ERDiagram schema={schema} />
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {!sidebarOpen && (
          <button
            className="btn-icon sidebar-toggle-closed"
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
        )}

        <div className="main-workspace">
          <div className="editor-section">
            <div className="editor-toolbar">
              <span className="dialect-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
                SQLite
              </span>
              <span className="dialect-badge" style={{ background: 'rgba(34, 211, 160, 0.1)', color: '#22d3a0', border: '1px solid rgba(34, 211, 160, 0.2)' }}>
                MySQL Compatible
              </span>
              <span className="editor-toolbar__info">
                {schema.length} table{schema.length !== 1 ? 's' : ''} in memory
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Ctrl+Enter to run
                </span>
              </div>
            </div>

            <div className="editor-wrap">
              <SqlEditor
                value={activeTab.query}
                onChange={updateQuery}
                onRun={runQuery}
                fontSize={fontSize}
                wordWrap={wordWrap}
                minimap={minimap}
                schema={schema}
                theme={theme}
                errorLine={errorLine}
              />
            </div>
          </div>

          <div
            className={`resizer ${dragging ? 'dragging' : ''}`}
            onMouseDown={onMouseDown}
            title="Drag to resize"
          />

          <div className="output-section" style={outputPosition === 'bottom' ? { height: outputHeight } : { width: outputHeight }}>
            <ResultPanel
              results={results}
              error={execError}
              executionTime={execTime}
              affectedRows={affectedRows}
              log={log}
              schema={schema}
              history={history}
              onClearHistory={() => clearHistory()}
              onRunHistory={loadHistory}
              forcedTab={resultTabTrigger}
              browseResult={browseResult}
              browseTableName={browseTableName}
            />
          </div>
        </div>

        {viewingTable && (
          <div className="table-viewer-overlay">
            <TableDataViewer 
              tableName={viewingTable} 
              onClose={() => setViewingTable(null)} 
            />
          </div>
        )}
      </div>

      <div className="statusbar">
        <span className="statusbar__item">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
          SQLide v1.0
        </span>
        <span className="statusbar__item">SQLite (in-browser)</span>
        <span className="statusbar__item">{schema.length} tables</span>
        {running && <span className="statusbar__item"><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Running…</span>}
      </div>



      {snippetOpen && (
        <div className="modal-backdrop" onClick={() => setSnippetOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
              SQL Snippets
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.keys(SNIPPETS).map(name => (
                <button key={name} className="btn btn-ghost" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => loadSnippet(name)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              Editor Settings
            </div>
            <div className="settings-row">
              <span className="settings-label">Font Size</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setFontSize(f => Math.max(10, f - 1))}>−</button>
                <span className="settings-value">{fontSize}px</span>
                <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setFontSize(f => Math.min(24, f + 1))}>+</button>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">Word Wrap</span>
              <label className="toggle">
                <input type="checkbox" checked={wordWrap} onChange={e => setWordWrap(e.target.checked)} />
                <div className="toggle__track" />
                <div className="toggle__thumb" />
              </label>
            </div>
            <div className="settings-row">
              <span className="settings-label">Minimap</span>
              <label className="toggle">
                <input type="checkbox" checked={minimap} onChange={e => setMinimap(e.target.checked)} />
                <div className="toggle__track" />
                <div className="toggle__thumb" />
              </label>
            </div>
            <div className="settings-row">
              <span className="settings-label">Interface Theme</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button 
                  className={`btn btn-ghost ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  Classic
                </button>
                <button 
                  className={`btn btn-ghost ${theme === 'noir' ? 'active' : ''}`}
                  onClick={() => setTheme('noir')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  Noir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="modal-backdrop" onClick={() => setShareOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Share Query
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Copy this URL to share your current query with anyone:
            </p>
            <div className="share-url-box">
              <input type="text" readOnly value={shareUrl} onClick={e => (e.target as HTMLInputElement).select()} />
              <button className="btn btn-run" onClick={() => { navigator.clipboard.writeText(shareUrl); }}>Copy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <SqlProvider>
      <IDE />
      <SpeedInsights />
    </SqlProvider>
  );
}
