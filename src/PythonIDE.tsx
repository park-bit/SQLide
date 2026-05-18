import React, { useCallback, useEffect, useRef, useState } from 'react';
import PyEditor from './PyEditor';

interface Tab {
  id: string;
  name: string;
  query: string;
}

const SNIPPETS: Record<string, string> = {
  'New Script': `# A new Python script\nprint("Hello from PythonIDE!")`,
  'Variables & Logic': `x = 10\ny = 20\n\nif x < y:\n    print(f"{x} is less than {y}")\nelse:\n    print(f"{x} is greater than or equal to {y}")`,
  'List Comprehension': `squares = [x**2 for x in range(10)]\nprint("Squares:", squares)`,
  'Data Structures': `user = {\n    "name": "Alice",\n    "age": 28,\n    "skills": ["Python", "SQL", "React"]\n}\n\nfor skill in user["skills"]:\n    print(f"Skill: {skill}")`,
};

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

export default function PythonIDE({ onSwitchToSql }: { onSwitchToSql: () => void }) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const pyodideRef = useRef<any>(null);

  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', name: 'main.py', query: SNIPPETS['New Script'] },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{level: string, message: string, timestamp: Date}[]>([]);
  const [errorLine, setErrorLine] = useState<number | undefined>();

  const appendLog = useCallback((level: string, message: string) => {
    setLog(prev => [...prev.slice(-499), { level, message, timestamp: new Date() }]);
  }, []);

  useEffect(() => {
    if ((window as any).loadPyodide) {
      initPyodide();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
    script.onload = () => initPyodide();
    script.onerror = () => setInitError('Failed to load Pyodide from CDN');
    document.head.appendChild(script);

    async function initPyodide() {
      try {
        const pyodide = await (window as any).loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/"
        });
        pyodideRef.current = pyodide;
        
        pyodide.setStdout({ batched: (msg: string) => appendLog('info', msg) });
        pyodide.setStderr({ batched: (msg: string) => appendLog('error', msg) });
        
        setReady(true);
      } catch (err: any) {
        setInitError(err.toString());
      }
    }
  }, [appendLog]);

  const addTab = useCallback(() => {
    const id = crypto.randomUUID();
    const num = tabs.length + 1;
    setTabs(prev => [...prev, { id, name: `script_${num}.py`, query: `# New script\n` }]);
    setActiveTabId(id);
  }, [tabs.length]);

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) return [{ id: '1', name: 'main.py', query: SNIPPETS['New Script'] }];
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

  const runQuery = useCallback(async () => {
    if (!ready || running || !pyodideRef.current) return;
    const code = activeTab.query.trim();
    if (!code) return;
    setRunning(true);
    setErrorLine(undefined);
    const t0 = performance.now();
    
    appendLog('ok', `> Executing ${activeTab.name}...`);
    
    try {
      // Clear variables from previous runs in the namespace if desired, but retaining state is common in IDEs.
      const res = await pyodideRef.current.runPythonAsync(code);
      const t1 = performance.now();
      if (res !== undefined) {
        appendLog('info', String(res));
      }
      appendLog('ok', `OK · Execution completed in ${(t1 - t0).toFixed(1)}ms`);
    } catch (err: any) {
      const errStr = String(err);
      appendLog('error', errStr);
      
      const lineMatch = errStr.match(/line (\d+)/i);
      if (lineMatch) {
        setErrorLine(parseInt(lineMatch[1]));
      }
    } finally {
      setRunning(false);
    }
  }, [ready, running, activeTab.query, activeTab.name, appendLog]);

  const [snippetOpen, setSnippetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [minimap, setMinimap] = useState(false);
  const [outputPosition, setOutputPosition] = useState<'bottom' | 'right'>('bottom');
  const [theme, setTheme] = useState<'dark' | 'noir'>(() => Math.random() > 0.5 ? 'noir' : 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const { size: outputHeight, dragging, onMouseDown } = useResizer(240, outputPosition);

  const loadSnippet = useCallback((name: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, query: SNIPPETS[name] } : t));
    setSnippetOpen(false);
  }, [activeTabId]);

  const shareUrl = `${window.location.origin}${window.location.pathname}?py=${btoa(encodeURIComponent(activeTab.query))}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('py');
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
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>Initializing Pyodide engine…</span>
      </div>
    );
  }

  if (initError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12, color: 'var(--error)' }}>
        <span>⚠ Failed to load Pyodide engine</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{initError}</span>
      </div>
    );
  }

  return (
    <div className={`app-shell layout-${outputPosition}`}>
      <nav className="topnav">
        <div className="topnav__logo" style={{ cursor: 'pointer' }} onClick={onSwitchToSql}>
          <div className="topnav__logo-icon" style={{ background: '#3776ab', padding: 2 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C7.58 2 4 5.58 4 10V14C4 18.42 7.58 22 12 22C16.42 22 20 18.42 20 14V10C20 5.58 16.42 2 12 2ZM12 20C8.69 20 6 17.31 6 14V10C6 6.69 8.69 4 12 4C15.31 4 18 6.69 18 10V14C18 17.31 15.31 20 12 20Z" fill="white"/>
            </svg>
          </div>
          <span className="topnav__logo-name">Python<span>IDE</span></span>
        </div>
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
          <button id="btn-settings" className="btn btn-ghost" onClick={() => setSettingsOpen(true)} title="Settings">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          
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
              <button className="sidebar__tab active">Files</button>
              <button className="btn-icon" style={{ marginLeft: 'auto' }} onClick={() => setSidebarOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="sidebar__body" style={{ padding: 12 }}>
               <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                 Local File System (Virtual)
               </div>
               <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                 {tabs.map(tab => (
                   <div key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => setActiveTabId(tab.id)}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                       <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                     </svg>
                     {tab.name}
                   </div>
                 ))}
               </div>
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
                Pyodide Environment
              </span>
              <span className="editor-toolbar__info">
                Python 3.11
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Ctrl+Enter to run
                </span>
              </div>
            </div>

            <div className="editor-wrap">
              <PyEditor
                value={activeTab.query}
                onChange={updateQuery}
                onRun={runQuery}
                fontSize={fontSize}
                wordWrap={wordWrap}
                minimap={minimap}
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
            <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-tabs">
                <button className="panel-tab active">Console</button>
                <button className="btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }} onClick={() => setLog([])}>
                  Clear
                </button>
              </div>
              <div className="panel-content" style={{ padding: 12, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {log.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Output will appear here...</div>
                ) : (
                  log.map((l, i) => (
                    <div key={i} style={{ 
                      color: l.level === 'error' ? 'var(--error)' : l.level === 'ok' ? 'var(--success)' : 'var(--text-primary)',
                      marginBottom: 4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {l.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="statusbar">
        <span className="statusbar__item">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
          PythonIDE v1.0
        </span>
        <span className="statusbar__item">Pyodide (in-browser)</span>
        {running && <span className="statusbar__item"><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Running…</span>}
      </div>

      {snippetOpen && (
        <div className="modal-backdrop" onClick={() => setSnippetOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
              Python Snippets
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
            <div className="settings-row">
              <span className="settings-label">Switch to SQLide</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button 
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={onSwitchToSql}
                >
                  Open SQLide
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
              Share Script
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Copy this URL to share your current script with anyone:
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
