# Project Customization & Agent Rules

## Figma Design-to-Code Standard Workflow

Figma MCP availability depends on the harness in use. Support **both** servers and use whichever one is actually available in the current session (check the tool list first; do not assume):

- **Option A — `figma-dev-mode-mcp-server` (other harnesses / Cline-style Dev Mode server)**:
  - Tools: `get_design_context` + `get_screenshot`, assets served at `http://localhost:3845/assets/...`.
  - Invocation sequence: call `get_design_context` with the extracted `nodeId` (e.g. `3:578`), then `get_screenshot` for visual cross-check.
- **Option B — `figma-developer-mcp` (Framelink, installed in this project's opencode config)**:
  - Tools: `get_file_info`, `get_frame`, `get_design_tokens`, `get_asset`, etc. (supports both file URL and node ID references).
  - Invocation sequence: resolve the target frame/node ID, then call `get_frame` (or the closest available context tool) for the design metadata.

Shared rules (apply to whichever server is active):

1. **Tool Invocation Sequence**:
   - Always fetch design context for the target `nodeId`/frame first.
   - Immediately follow with a screenshot/render call for the node to inspect visual rendering.

2. **100% Pure Code Extraction (No Screenshot/Image Inference for Code)**:
   - **DO NOT rely on screenshots or visual image references to infer code logic, font styles, text shadows, or layout values.**
   - **ALWAYS extract code 100% purely and strictly from design context metadata**, exact SVG vectors, typography specifications (font family, weight, size, line-height), spacing, padding, and layout structures — mapping primary accent and surface colors to dynamic theme tokens (`theme.color`, `theme.surface`).
   - Use the screenshot/render output ONLY as a post-implementation visual cross-check, never as the primary source for code values or styling decisions.

3. **Exact Asset Extraction**:
   - Never substitute Figma vector assets with generic CDN icon libraries.
   - Always use the exact SVG assets provided by the active Figma server (e.g. `http://localhost:3845/assets/...`) or inline SVG code from the design context.

4. **Pixel-Perfect Token & Layout Fidelity**:
   - Enforce exact fonts (`Nunito`), font-weights, padding, sizes, and border-radius.
   - Map primary accent colors and surface styles to dynamic theme tokens (`theme.color`, `theme.surface`) per the Design System Compliance Rules below, NEVER hardcoding static hex values.
   - Replicate complex layout structures (e.g., dynamic sliding active tab indicators, absolute positioning, state variants) accurately.

5. **Visual Verification & Output Scope**:
   - Cross-check generated code against the screenshot/render output to ensure 100% visual and layout fidelity.
   - Do not generate separate demo HTML files unless explicitly requested by the user.

## Graphify Knowledge Graph Rules

This project has a graphify knowledge graph at `graphify-out/`.

**Rules**:
- For codebase or architecture questions, when `graphify-out/graph.json` exists, first run `graphify query "<question>"` (CLI) or `query_graph` (MCP). Use `graphify path "<A>" "<B>"` / `shortest_path` for relationships and `graphify explain "<concept>"` / `get_node` for focused concepts.
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Context7 Documentation Rules

When looking up documentation for third-party libraries, frameworks, or APIs (e.g., Expo, React Native, Expo Router, TanStack Query, Expo SQLite, Zod, date-fns):

**Rules**:
- Use `ctx7` (Context7 CLI) or `context7` MCP server to fetch up-to-date documentation, API references, and code examples for external packages instead of inferring signatures.
- Query library context before writing code against new or updated framework APIs.

## Ponytail Efficiency & Simplification Rules

Prefer the simplest, shortest, most minimal solution that actually works (YAGNI). Channel a lazy senior developer: code never written has zero bugs.

**Rules**:
- **The Ladder**: Check if task needs to exist at all → Reuse existing codebase helpers → Stdlib/Native features → Installed dependencies → Minimal code.
- **No Over-Engineering**: Avoid unrequested abstractions, single-implementation interfaces, or speculative boilerplate for "later".
- **Root Cause Bug Fixes**: Fix bugs at the root cause, not with symptom patches at individual call sites.
- *Deletion > Addition**: Deletion over addition; boring, direct code over clever solutions.

## Design System Compliance Rules

This project has an established design system at `src/design-system/`. All UI work — whether implementing new screens, modifying existing ones, or converting from Figma — **MUST conform to the existing design system at all times**.

### Font Rules
- **Always use `fontFamily` tokens** from `src/design-system/typography.ts`, never raw `fontWeight`.
  - `300` → `fontFamily: 'Nunito-Light'`
  - `400` → `fontFamily: 'Nunito-Regular'`
  - `600` → `fontFamily: 'Nunito-SemiBold'`
  - `700+` → `fontFamily: 'Nunito-Bold'`
- **Always use standardized `fontSize` tokens** from the `TYPOGRAPHY` scale:
  - `xs`: 10px · `small`: 12px · `body`: 16px · `large`: 18px · `h3`: 24px · `h2`: 32px · `h1`: 48px
  - Map any off-scale size to the nearest token (e.g., 13→12, 14→12 or 16, 15→16, 17→18, 20→18).

### Color & Dynamic Theme Rules
- **Always use color tokens** from `src/design-system/colors.ts` (e.g., `BLACK_SCALE`, `GREEN_SCALE`).
- **Always use dynamic theme tokens from `useTheme()`**:
  - **Dynamic Accent**: Always use `theme.color.accent`, `theme.color.accentSurface`, `theme.color.accentSoft`, `theme.color.onAccent`, and `theme.color.background`. NEVER hardcode primary hex values (e.g. `#7F6EB5` or `#F2F1F8`) when styling UI components or converting from Figma.
  - **Dynamic Surface Style (`Outline` vs `Soft Shadow`)**: Always use `theme.surface` tokens (`theme.surface.borderWidth`, `theme.surface.borderColor`, `theme.surface.shadowColor`, `theme.surface.shadowOpacity`, `theme.surface.elevation`) or the `<Card>` component. NEVER hardcode `borderWidth: 1` or static border colors on cards/containers without respecting `theme.surface.style`.

### Figma Discrepancy Protocol
- When a Figma reference (`get_design_context`) provides values (font sizes, colors, spacing) that **differ from the existing design system tokens**:
  1. **Do NOT silently apply the Figma values** if they contradict the design system.
  2. **Immediately flag the discrepancy** to the user and list: what Figma specifies vs. what the design system defines.
  3. **Wait for explicit user approval** before deviating from the design system.
  4. If the user confirms the Figma values should override, apply them; otherwise, use the design system token.


## Local Documentation Storage Rules

**Centralized Directory**: `project-docs/` (configured in `.gitignore` as `project-docs/` — will not be pushed to GitHub).

**Rules**:
- **MANDATORY**: Create all new documentation (PRDs, plans, audits, reports, implementation plans, analysis, etc.) inside `project-docs/` — **DO NOT** place them in the root directory.
- The root directory may only contain standard markdown files: `README.md`, `AGENTS.md`, `SECURITY.md`, `LICENSE`. Any other `.md` file in the root is considered a violation.
- If `project-docs/` does not exist yet (e.g. after a fresh clone), create it first: `New-Item -ItemType Directory -Path "project-docs" -Force | Out-Null` before writing any documents.
- When moving or archiving legacy documents from the root, move them into `project-docs/` and never leave duplicates in the root.
- References in other documents must point to `project-docs/<filename>` (e.g. `project-docs/PRD V2.md`, not `PRD V2.md`).
- The existing `docs/` directory (`docs/testing/`) remains tracked for public/open documentation; `project-docs/` is strictly for private internal/local documents.
