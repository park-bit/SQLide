import { useCallback, useRef, useState, useMemo } from 'react';
import Editor from '@monaco-editor/react';

interface SchemaRef {
  name: string;
  columns: { name: string }[];
}

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  height?: string;
  fontSize?: number;
  wordWrap?: boolean;
  minimap?: boolean;
  schema?: SchemaRef[];
  theme?: 'dark' | 'noir';
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'INDEX', 'VIEW', 'TRIGGER',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS',
  'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS', 'ANY', 'ALL',
  'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'UNION', 'INTERSECT', 'EXCEPT',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'CHECK', 'CONSTRAINT',
  'INTEGER', 'INT', 'TEXT', 'VARCHAR', 'CHAR', 'REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL',
  'BOOLEAN', 'BOOL', 'DATE', 'DATETIME', 'TIMESTAMP', 'BLOB',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'IFNULL', 'NULLIF', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'AUTOINCREMENT', 'AUTO_INCREMENT', 'IF', 'NOT', 'EXISTS', 'CASCADE', 'RESTRICT',
  'TRANSACTION', 'COMMIT', 'ROLLBACK', 'BEGIN', 'SAVEPOINT',
  'EXPLAIN', 'ANALYZE', 'VACUUM', 'PRAGMA',
];

const SQL_FUNCTIONS = [
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'LENGTH', 'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM',
  'SUBSTR', 'SUBSTRING', 'REPLACE', 'INSTR', 'PRINTF', 'FORMAT', 'DATE', 'TIME', 'DATETIME',
  'JULIANDAY', 'STRFTIME', 'ABS', 'ROUND', 'CEIL', 'FLOOR', 'MOD', 'RANDOM', 'COALESCE',
  'IFNULL', 'NULLIF', 'GROUP_CONCAT', 'JSON', 'JSON_OBJECT', 'JSON_ARRAY',
];

type MonacoInstance = any;

export default function SqlEditor({
  value, onChange, onRun, height = '100%',
  fontSize = 14, wordWrap = false, minimap = false, schema = [],
  theme = 'dark',
}: SqlEditorProps) {
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const disposableRef = useRef<{ dispose: () => void } | null>(null);

  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  const handleMount = useCallback((editor: MonacoInstance, monaco: MonacoInstance) => {
    monaco.editor.defineTheme('sqlide-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '4f8ef7', fontStyle: 'bold' },
        { token: 'keyword.sql', foreground: '4f8ef7', fontStyle: 'bold' },
        { token: 'string', foreground: '86efac' },
        { token: 'string.sql', foreground: '86efac' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
        { token: 'operator', foreground: 'f472b6' },
        { token: 'identifier', foreground: 'e8eaf0' },
        { token: 'type', foreground: 'a78bfa' },
      ],
      colors: {
        'editor.background': '#0d0e14',
        'editor.foreground': '#e8eaf0',
        'editor.lineHighlightBackground': '#1a1b26',
        'editor.selectionBackground': '#4f8ef740',
        'editorCursor.foreground': '#4f8ef7',
        'editorLineNumber.foreground': '#565970',
        'editorLineNumber.activeForeground': '#8b8fa8',
        'editorGutter.background': '#0d0e14',
        'editorWidget.background': '#13141c',
        'editorSuggestWidget.background': '#13141c',
        'editorSuggestWidget.border': '#2a2c3e',
        'editorSuggestWidget.selectedBackground': '#1a1b26',
        'input.background': '#1a1b26',
        'scrollbarSlider.background': '#2a2c3e80',
        'scrollbarSlider.hoverBackground': '#343650',
      },
    });

    monaco.editor.defineTheme('sqlide-noir', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '61afef', fontStyle: 'bold' },
        { token: 'keyword.sql', foreground: '61afef', fontStyle: 'bold' },
        { token: 'string', foreground: 'e5c07b' },
        { token: 'string.sql', foreground: 'e5c07b' },
        { token: 'number', foreground: 'e2ff31' },
        { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
        { token: 'operator', foreground: '56b6c2' },
        { token: 'identifier', foreground: 'ffffff' },
        { token: 'type', foreground: '56b6c2' },
        { token: 'predefined', foreground: '56b6c2' },
      ],
      colors: {
        'editor.background': '#0a0a0a',
        'editor.foreground': '#ffffff',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editor.selectionBackground': '#ffffff20',
        'editorCursor.foreground': '#ffffff',
        'editorLineNumber.foreground': '#4b5263',
        'editorLineNumber.activeForeground': '#ffffff',
        'editorGutter.background': '#0a0a0a',
        'editorWidget.background': '#111111',
        'editorSuggestWidget.background': '#111111',
        'editorSuggestWidget.border': '#222222',
        'editorSuggestWidget.selectedBackground': '#181818',
        'input.background': '#181818',
        'scrollbarSlider.background': '#33333380',
        'scrollbarSlider.hoverBackground': '#444444',
      },
    });

    monaco.editor.setTheme(theme === 'noir' ? 'sqlide-noir' : 'sqlide-dark');

    if (disposableRef.current) disposableRef.current.dispose();

    disposableRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: MonacoInstance, position: MonacoInstance) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = [
          ...SQL_KEYWORDS.map((kw: string) => ({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
            sortText: '1_' + kw,
          })),
          ...SQL_FUNCTIONS.map((fn: string) => ({
            label: fn + '()',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: fn + '($1)',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: '2_' + fn,
          })),
          ...schema.map(t => ({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            range,
            sortText: '0_' + t.name,
            detail: 'Table',
          })),
          ...schema.flatMap(t => t.columns.map(c => ({
            label: c.name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: c.name,
            range,
            sortText: '0_' + c.name,
            detail: `${t.name} column`,
          }))),
        ];
        return { suggestions };
      },
    });

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current()
    );

    editor.onDidChangeCursorPosition((e: MonacoInstance) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    editor.focus();
  }, [schema, theme]);

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
    suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: false },
    tabSize: 2,
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
          defaultLanguage="sql"
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
