# Frontend Instructions

- Keep `src/App.tsx` limited to provider and router assembly.
- Put user-facing behavior in `src/features/<feature>`.
- Components must not build API URLs or call `fetch` directly.
- Every feature owns its API adapter; shared code owns only the HTTP client and generated types.
- Keep query keys in `shared/queryKeys.ts`.
- Workbench timeline operations are pure model/reducer code and receive data through props.
- Do not add `any`; model unknown API data explicitly.
- Keep platform pages independent from workbench internals.
- Use ESLint, Prettier, strict TypeScript, Vitest, React Testing Library, and Playwright.
