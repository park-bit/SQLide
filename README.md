# SQLide : Professional SQL Workbench IDE

SQLide is a high-performance, aesthetically premium web-based SQL IDE built for speed and privacy.

![SQLide Logo](public/logo.svg)

Execute complex queries,
visualize ER diagrams,
and manage your schemas entirely in the browser with zero latency.
website live [here](https://sqlide.is-a.dev)

[website demo.webm](https://github.com/user-attachments/assets/023cdd55-0378-422b-be7a-c4d4b1089215)


## Features

- **Local-First Execution**: Powered by `sql.js` (SQLite WASM) for near-instant execution using your browser's RAM. (no database storin, 100 percent secure)
- **Interactive ER Diagrams**: Automatically visualize table relationships with Foreign Key detection and dashed connection lines.
- **Pro Editor**: Integrated Monaco Editor (VS Code engine) with SQL autocomplete, font sizing, and word wrap.
- **Data Portability**: Import/Export your databases as `.sqlite` files. Export query results to CSV or JSON.
- **Smart Schema Explorer**: Browse tables, views, and columns with a single click.
- **Modern Aesthetic**: Deep dark mode with glassmorphism effects and responsive layout.
- **Kanye West Inspiration**: Every new session starts with a random quote from the Kanye REST API. (yes its a feature :)

```mermaid
      flowchart TD
   
   subgraph group_ui["Browser UI"]
     node_main["Main<br/>entry<br/>[main.tsx]"]
     node_app["App<br/>shell<br/>[App.tsx]"]
     node_sql_editor["SQL Editor<br/>[SqlEditor.tsx]"]
     node_result_panel["Results<br/>output panel<br/>[ResultPanel.tsx]"]
     node_schema_explorer["Schema<br/>navigator<br/>[SchemaExplorer.tsx]"]
     node_table_viewer["Table View<br/>table browser"]
     node_er_diagram(("ER Diagram<br/>schema graph<br/>[ERDiagram.tsx]"))
   end
   
   subgraph group_data["Data Layer"]
     node_sql_context{{"SqlContext<br/>coordination context<br/>[SqlContext.tsx]"}}
     node_db_state[("In-Memory DB<br/>sqlite state")]
     node_sql_wasm{{"sql.js WASM<br/>sqlite engine<br/>[sql-wasm.wasm]"}}
     node_quote_api(("Quote API<br/>external service"))
   end
   
   subgraph group_platform["Platform"]
     node_styles["Styles<br/>css shell<br/>[App.css]"]
     node_theme["Global CSS<br/>theme<br/>[index.css]"]
     node_vite["Vite Build<br/>tooling<br/>[vite.config.ts]"]
     node_vercel["Vercel Deploy<br/>static hosting<br/>[vercel.json]"]
     node_public_assets["Public Assets<br/>static assets<br/>[robots.txt]"]
   end
   
   node_main -->|"mounts"| node_app
   node_main -->|"loads"| node_styles
   node_main -->|"loads"| node_theme
   node_app -->|"contains"| node_sql_editor
   node_app -->|"contains"| node_result_panel
   node_app -->|"contains"| node_schema_explorer
   node_app -->|"contains"| node_table_viewer
   node_app -->|"contains"| node_er_diagram
   node_app -->|"provides"| node_sql_context
   node_sql_editor -->|"submits sql"| node_sql_context
   node_result_panel -->|"reads output"| node_sql_context
   node_schema_explorer -->|"reads schema"| node_sql_context
   node_table_viewer -->|"reads rows"| node_sql_context
   node_er_diagram -->|"reads metadata"| node_sql_context
   node_sql_context -->|"manages"| node_db_state
   node_sql_context -->|"executes via"| node_sql_wasm
   node_sql_context -.->|"optionally fetches"| node_quote_api
   node_sql_wasm -->|"loaded from"| node_public_assets
   node_vite -->|"bundles"| node_public_assets
   node_vercel -->|"hosts"| node_public_assets
   node_vercel -->|"deploys output"| node_vite
   
   click node_main "https://github.com/park-bit/sqlide/blob/main/src/main.tsx"
   click node_app "https://github.com/park-bit/sqlide/blob/main/src/App.tsx"
   click node_sql_editor "https://github.com/park-bit/sqlide/blob/main/src/SqlEditor.tsx"
   click node_result_panel "https://github.com/park-bit/sqlide/blob/main/src/ResultPanel.tsx"
   click node_schema_explorer "https://github.com/park-bit/sqlide/blob/main/src/SchemaExplorer.tsx"
   click node_table_viewer "https://github.com/park-bit/sqlide/blob/main/src/TableDataViewer.tsx"
   click node_er_diagram "https://github.com/park-bit/sqlide/blob/main/src/ERDiagram.tsx"
   click node_sql_context "https://github.com/park-bit/sqlide/blob/main/src/SqlContext.tsx"
   click node_sql_wasm "https://github.com/park-bit/sqlide/blob/main/public/sql-wasm.wasm"
   click node_styles "https://github.com/park-bit/sqlide/blob/main/src/App.css"
   click node_theme "https://github.com/park-bit/sqlide/blob/main/src/index.css"
   click node_vite "https://github.com/park-bit/sqlide/blob/main/vite.config.ts"
   click node_vercel "https://github.com/park-bit/sqlide/blob/main/vercel.json"
   click node_public_assets "https://github.com/park-bit/sqlide/blob/main/public/robots.txt"
   
   classDef toneNeutral fill:#f8fafc,stroke:#334155,stroke-width:1.5px,color:#0f172a
   classDef toneBlue fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#172554
   classDef toneAmber fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f
   classDef toneMint fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d
   classDef toneRose fill:#ffe4e6,stroke:#e11d48,stroke-width:1.5px,color:#881337
   classDef toneIndigo fill:#e0e7ff,stroke:#4f46e5,stroke-width:1.5px,color:#312e81
   classDef toneTeal fill:#ccfbf1,stroke:#0f766e,stroke-width:1.5px,color:#134e4a
   class node_main,node_app,node_sql_editor,node_result_panel,node_schema_explorer,node_table_viewer,node_er_diagram toneBlue
   class node_sql_context,node_db_state,node_sql_wasm,node_quote_api toneAmber
   class node_styles,node_theme,node_vite,node_vercel,node_public_assets toneMint
```
## Tech Stack

- **Core**: React + TypeScript + Vite
- **Database Engine**: [sql.js](https://github.com/sql-js/sql.js) (SQLite WebAssembly)
- **Editor**: [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- **Icons**: Lucide React + Custom SVGs
- **Styling**: Vanilla CSS with Design Tokens

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Run locally**:
   ```bash
   npm run dev
   ```
3. **Build for production**:
   ```bash
   npm run build
   ```

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0 - see the [LICENSE](LICENSE) file for details.

---
Built by [park-bit](https://github.com/park-bit); [support me?](https://www.chai4.me/park-bit); [website-link](https://sqlide.is-a.dev)
