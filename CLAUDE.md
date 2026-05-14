# CV-Dash — Project Instructions

## UI Component Rule (MANDATORY)

**All UI in this project must be built using shadcn components.**

- Use the `shadcn-studio-mcp` MCP server (configured in `.mcp.json`) to discover, fetch, and install components and blocks.
- Before writing any new UI markup, consult the MCP for an existing shadcn component or block that fits the need.
- Do not create bespoke component primitives (buttons, inputs, dialogs, dropdowns, tables, cards, etc.) — install the shadcn equivalent via the MCP and compose from there.
- Theming, dark mode, and tokens must follow shadcn conventions (Tailwind + CSS variables).
- Custom components are allowed only when they compose shadcn primitives or when no shadcn equivalent exists — in that case, prefer requesting a shadcn block from the MCP first.

### Required MCP tools to use

When building UI, prefer these `shadcn-studio-mcp` tools:
- `get-blocks-metadata` / `get-block-meta-content` — discover and inspect blocks
- `get-component-meta-content` / `get-component-content` — inspect components before installing
- `get_add_command_for_components` / `get_add_command_for_items` — get the correct `shadcn add` command
- `get-create-instructions` / `get-ftc-instructions` / `get-refine-instructions` / `get-inspire-instructions` — follow the official authoring flow
- `install-theme` — apply themes rather than hand-rolling palettes
- `parse-figma-blocks` — when a Figma source exists

### Workflow

1. Identify the UI need (e.g. "data table with filters").
2. Query the MCP for matching blocks/components.
3. Install via the returned `shadcn add ...` command.
4. Compose. Do not rewrite the primitive.
5. If nothing fits, ask the MCP for create/refine instructions before authoring custom code.

## Other notes

- This is a greenfield project — no existing code to preserve.
- Stack defaults: Next.js App Router, TypeScript, Tailwind, shadcn/ui.
