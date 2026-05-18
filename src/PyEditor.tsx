import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';

interface PyEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  height?: string;
  fontSize?: number;
  wordWrap?: boolean;
  minimap?: boolean;
  theme?: 'dark' | 'noir';
  errorLine?: number;
}

type MonacoInstance = any;

export default function PyEditor({
  value, onChange, onRun, height = '100%',
  fontSize = 14, wordWrap = false, minimap = false,
  theme = 'dark', errorLine,
}: PyEditorProps) {
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const editorRef = useRef<MonacoInstance | null>(null);
  const monacoRef = useRef<MonacoInstance | null>(null);
  const decorationRef = useRef<string[]>([]);
  const disposableRef = useRef<{ dispose: () => void } | null>(null);

  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (errorLine && errorLine > 0) {
      decorationRef.current = editor.deltaDecorations(decorationRef.current, [
        {
          range: new monaco.Range(errorLine, 1, errorLine, 1),
          options: {
            isWholeLine: true,
            className: 'error-line-highlight',
            glyphMarginClassName: 'error-glyph-margin',
            hoverMessage: { value: 'Error detected around here.' },
            zIndex: 10,
          }
        }
      ]);
      editor.revealLineInCenterIfOutsideViewport(errorLine);
    } else {
      decorationRef.current = editor.deltaDecorations(decorationRef.current, []);
    }
  }, [errorLine]);

  const handleMount = useCallback((editor: MonacoInstance, monaco: MonacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // We can reuse the same themes
    monaco.editor.setTheme(theme === 'noir' ? 'sqlide-noir' : 'sqlide-dark');

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current()
    );

    editor.onDidChangeCursorPosition((e: MonacoInstance) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    editor.focus();
  }, [theme]);

  const options = useMemo(() => ({
    fontSize,
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontLigatures: true,
    minimap: { enabled: minimap },
    wordWrap: (wordWrap ? 'on' : 'off') as 'on' | 'off',
    scrollBeyondLastLine: false,
    lineNumbers: 'on' as 'on',
    renderLineHighlight: 'gutter' as 'gutter',
    cursorBlinking: 'smooth' as 'smooth',
    cursorSmoothCaretAnimation: 'on' as 'on',
    smoothScrolling: true,
    padding: { top: 12, bottom: 12 },
    tabSize: 4,
    insertSpaces: true,
    formatOnPaste: true,
    bracketPairColorization: { enabled: true },
    contextmenu: true,
    scrollbar: {
      vertical: 'auto' as 'auto',
      horizontal: 'auto' as 'auto',
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 6,
    },
  }), [fontSize, wordWrap, minimap]);

  return (
    <div style={{ height, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          height="100%"
          defaultLanguage="python"
          value={value}
          onChange={v => onChange(v ?? '')}
          onMount={handleMount}
          theme={theme === 'noir' ? 'sqlide-noir' : 'sqlide-dark'}
          options={options}
        />
      </div>
      <div style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        padding: '2px 10px',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: theme === 'noir' ? '#666666' : '#565970',
        background: theme === 'noir' ? 'rgba(10,10,10,0.8)' : 'rgba(13,14,20,0.8)',
        borderTopLeftRadius: 4,
        userSelect: 'none',
      }}>
        Ln {cursorPos.line}, Col {cursorPos.col}
      </div>
    </div>
  );
}
