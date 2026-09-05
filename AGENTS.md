# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript React application built with Next.js-compatible Vinext and Vite. Application routes and UI live in `app/`: `app/page.tsx` contains the interactive workforce and weather scheduler, `app/layout.tsx` defines document metadata and fonts, and `app/globals.css` holds global styles and component-specific CSS. Static files belong in `public/` (for example, `public/hanwha-logo.jpg`). Build and tooling configuration is at the repository root: `vite.config.ts`, `next.config.ts`, `tsconfig.json`, and `eslint.config.mjs`.

Keep scheduling rules, types, and UI changes close to the route that uses them until reuse warrants extracting a focused module.

## Build, Test, and Development Commands

Use Node.js 22.13 or later and npm:

- `npm install` installs the locked dependencies.
- `npm run dev` starts the local Vinext/Vite development server.
- `npm run build` produces a production build; run it before handing off substantial UI or configuration work.
- `npm run start` serves the production build locally.
- `npm run lint` runs ESLint across the project, excluding generated build directories.

There is currently no automated test script. Validate behavior manually in the browser, particularly task creation, crew limits, weather decisions, and responsive layout.

## Coding Style & Naming Conventions

Write TypeScript with explicit types for domain data and component state. Follow the existing style: two-space indentation, single quotes, semicolons, and trailing commas in multiline objects. Use PascalCase for React components and types (`ScheduledTask`), camelCase for functions and variables (`calculateRisk`), and descriptive lowercase CSS classes with hyphens (`global-header`). Keep user-facing Korean copy consistent with the existing interface. Run `npm run lint` after edits; ESLint uses Next core-web-vitals and TypeScript rules.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit-style subjects, such as `feat: apply Hanwha scheduler redesign`. Use `feat:`, `fix:`, `refactor:`, or `docs:` followed by an imperative, focused summary. Keep unrelated changes separate.

Pull requests should state the user-visible change, note validation performed (`npm run lint`, `npm run build`), link related issues when available, and include screenshots or a short recording for visual or interaction changes. Call out changes to scheduling or weather-risk logic explicitly.

## Configuration & Security

Do not commit secrets. Place local environment values in ignored `.env*` files. Treat `.openai/hosting.json` and `vite.config.ts` as deployment/runtime configuration; review binding changes carefully.
