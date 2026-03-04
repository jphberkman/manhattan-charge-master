# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server with Turbopack at localhost:3000
npm run build        # Production build
npm run lint         # ESLint

# Testing
npm test             # Run all tests (Vitest)
npx vitest run src/lib/__tests__/some.test.ts  # Run a single test file

# Database
npm run setup        # Install deps + generate Prisma client + run migrations
npm run db:reset     # Reset database (destructive)
npx prisma migrate dev   # Apply new migrations after schema changes
npx prisma generate      # Regenerate Prisma client after schema changes
```

`NODE_OPTIONS='--require ./node-compat.cjs'` is prepended to all Next.js commands to fix a Node 25+ Web Storage SSR issue (see `node-compat.cjs`).

## Architecture

### AI Generation Pipeline

User message → `ChatContext` (`useChat`) → `POST /api/chat` → Claude streams tool calls → `FileSystemContext.handleToolCall()` updates in-memory `VirtualFileSystem` → `PreviewFrame` re-renders iframe.

Two AI tools are available to the model:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`) — create, view, and edit files
- `file_manager` (`src/lib/tools/file-manager.ts`) — rename and delete files/directories

The system prompt lives in `src/lib/prompts/generation.tsx`. The model used is `claude-haiku-4-5`. If no `ANTHROPIC_API_KEY` is set, `MockLanguageModel` in `src/lib/provider.ts` generates static example components instead.

### Virtual File System

`VirtualFileSystem` (`src/lib/file-system.ts`) is an in-memory tree — no disk I/O. It serializes to JSON for DB persistence. The class is instantiated in `FileSystemContext` and shared across the editor, preview, and AI tool handlers.

### Preview System

`PreviewFrame` (`src/components/preview/PreviewFrame.tsx`) watches the file system for changes, then:
1. Passes all files through `jsx-transformer.ts` (Babel) — transforms JSX/TSX, resolves `@/` aliases, creates blob URLs
2. Builds an ES module import map (third-party packages resolved via `esm.sh`)
3. Injects everything into a sandboxed iframe with Tailwind CDN and an error boundary

Entry point detection: `/App.jsx`, `/App.tsx`, `/index.jsx`, `/index.tsx`.

### Authentication

JWT-based with `jose`, stored in an httpOnly cookie (`auth-token`, 7-day expiry). `src/lib/auth.ts` is `server-only`. Middleware (`src/middleware.ts`) protects `/api/projects/*`. All server actions call `getSession()` before DB access.

Passwords hashed with `bcrypt`. Anonymous users get no persistence — their work is tracked in `sessionStorage` via `src/lib/anon-work-tracker.ts`.

### Data Persistence

`Project.messages` and `Project.data` are JSON strings stored in SQLite. `data` is the serialized `VirtualFileSystem`. Saves happen in the `onFinish` callback of the `/api/chat` route after each AI response (authenticated users only).

### Key Files

| File | Role |
|------|------|
| `src/app/api/chat/route.ts` | Streaming AI generation endpoint |
| `src/app/[projectId]/page.tsx` | Project page (loads messages + file system from DB) |
| `src/app/main-content.tsx` | Top-level UI layout (chat + editor + preview panels) |
| `src/lib/file-system.ts` | VirtualFileSystem class (~900 lines) |
| `src/lib/provider.ts` | Model provider + MockLanguageModel fallback |
| `src/lib/contexts/chat-context.tsx` | Chat state, AI streaming, tool call dispatch |
| `src/lib/contexts/file-system-context.tsx` | File system state, tool call handling |
| `src/lib/transform/jsx-transformer.ts` | Babel JSX transform + import map generation |
| `src/actions/index.ts` | Auth server actions (signUp, signIn, signOut, getUser) |

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json` and `vitest.config.mts`)
