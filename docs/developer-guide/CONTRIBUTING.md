# Contributing to Genesis CRM

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Developer guide](README.md#core-reading-in-order)** › 9 of 9 · **For:** Engineers
> ← [Design system](design-system.md) · [Platform Builder extensions](engines/platform-builder-extensions.md) *(Engine references)* →
> New to Genesis? Background: [Understanding Genesis › Codebase tour](../understanding/08-codebase-tour.md)
<!-- /nav:top -->

Thank you for your interest in contributing to Genesis CRM! We welcome contributions from the community and are pleased
to have you aboard.

---

## Quick Start

1. **Fork the repository** and clone your fork locally
2. **Set up your development environment** following [architecture-and-setup.md](architecture-and-setup.md)
3. **Create a feature branch** from main: `git checkout -b feature/your-feature-name`
4. **Make your changes** with clear, focused commits
5. **Test your changes** thoroughly
6. **Submit a pull request** with a clear description

---

## Development Guidelines

### Code Style

- Follow the existing code patterns and conventions
- Use meaningful variable and function names
- Add comments for complex logic only — self-evident code needs no comment
- Ensure consistent formatting (ESLint runs on the frontend: `npm run lint`)

### Backend Conventions

- All service classes in `backend/src/services/`
- Routes organized by domain in `backend/src/routes/`
- Use Prisma ORM for all database access — no raw SQL except where absolutely necessary
- Validate all inputs at route level using Fastify JSON schemas
- Use `parseInt()` with bounds-checking for numeric IDs, not `Number()`

### Frontend Conventions

- All UI components use **default exports** — import as `import Button from '...'`, not `{ Button }`
- Use TanStack React Query v5 — `useMutation` takes a single options object
- Use `isPending` (not `isLoading`) for mutation state in React Query v5
- Zustand for global state (auth, theme), React Query for server state
- Tailwind CSS — avoid dynamic class names that Tailwind JIT cannot detect at build time

### Data Consistency Rules

- After writing a *stored* (non-formula) field value outside `RecordService.updateRecord`, call
  `RecordService.recompute(id, { propagate: true })` — plain `recompute(id)` does not reach parent roll-ups
  or readers unless the record's own formulas changed
- In the frontend, never hand-pick query keys after a mutation: call `invalidateRecordData(queryClient)` or
  `invalidateMetadata(queryClient)` from `frontend/src/utils/invalidate.js`
- Before changing metadata (renaming, deleting, removing options), consult `fieldUsages` / `objectUsages` in
  `backend/src/services/metadata-dependencies.js`
- New list or report queries over tasks, reminders or activities must exclude rows of records in the Trash

---

## Testing

### Backend Tests

```bash
cd backend
npm test          # Run all tests
```

- Write unit tests for all service methods
- Tests live in `backend/tests/`
- Keep the suite (95 test files, Jest) green — do not submit PRs that reduce coverage
- The suite mocks the database; it needs no MySQL

### Frontend Tests

```bash
cd frontend
npm test          # Run Vitest suite (vitest run)
```

- Tests live in `frontend/tests/`
- Use React Testing Library (`@testing-library/react`)
- Test component behavior, not implementation details

---

## Types of Contributions

### Bug Reports

- Use the issue template when possible
- Include steps to reproduce
- Provide system information and environment details
- Include screenshots if applicable

### Feature Requests

- Describe the use case and benefit
- Provide mockups or examples if helpful
- Consider backward compatibility
- Discuss implementation approach before building

### Code Contributions

- Focus on one feature or fix per PR
- Keep changes focused and atomic
- Follow the coding standards above
- Include appropriate tests

---

## Pull Request Process

1. **Update documentation** for new features or behavior changes
2. **Add/update tests** for your changes
3. **Ensure the frontend builds** locally (`npm run build` in `frontend/`; the backend has no build step)
4. **Ensure lint passes** (`npm run lint` in frontend)
5. **Write clear commit messages** explaining the *why*, not just the *what*
6. **Submit PR** with detailed description of changes and motivation
7. **Respond to review feedback** promptly

### Commit Message Format

```text
<type>: <short summary>

<optional body explaining motivation>
```

Types: `fix`, `feat`, `docs`, `refactor`, `test`, `chore`

Examples:

- `fix: correct lead scoring schema alignment`
- `feat: add load-balanced assignment strategy`
- `docs: update workflow builder guide with delay step examples`

---

## Architecture Principles

Before submitting, verify your changes respect these principles:

- **Metadata-driven**: New CRM entities should be configurable via Builder, not hard-coded
- **Permission-aware**: All new endpoints must enforce role-based access
- **Service-layer**: Business logic belongs in service classes, not route handlers
- **Fire-and-forget workflows**: Workflow execution must not block HTTP responses
- **No backwards-compat hacks**: Remove old code rather than wrapping it

---

## Getting Help

- Check the [Knowledge Base Index](../README.md)
- Review existing issues and discussions
- Ask questions in discussions or create an issue

---

## Code of Conduct

Please be respectful and professional in all interactions. We're building a welcoming community for contributors of all
backgrounds and experience levels.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Platform Builder extensions](engines/platform-builder-extensions.md) *(Engine references)* — Formulas, lookups, record actions, stage gates, BUs, barriers, audit chain, web forms, packs, portal, MFA, job queue |
| **Previous** | [Design system](design-system.md) |
| **Background** | [Understanding Genesis › Codebase tour](../understanding/08-codebase-tour.md) |
| **On these journeys** | [Engineer](../README.md#engineer) (step 9 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Developer guide](README.md#core-reading-in-order) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
