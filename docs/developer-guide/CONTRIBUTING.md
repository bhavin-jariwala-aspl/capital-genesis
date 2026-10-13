# Contributing to Genesis CRM

Thank you for your interest in contributing to Genesis CRM! We welcome contributions from the community and are pleased
to have you aboard.

---

## Quick Start

1. **Fork the repository** and clone your fork locally
2. **Set up your development environment** following [ARCHITECTURE_AND_SETUP.md](ARCHITECTURE_AND_SETUP.md)
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
- Ensure consistent formatting (ESLint enforced)

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

---

## Testing

### Backend Tests

```bash
cd backend
npm test          # Run all tests
```

- Write unit tests for all service methods
- Tests live in `backend/tests/`
- Keep 145+ tests green — do not submit PRs that reduce coverage

### Frontend Tests

```bash
cd frontend
npm test          # Run Vitest suite
npm run test:ui   # Vitest UI
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
3. **Ensure builds pass** locally (`npm run build` in both frontend and backend)
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

- Check the [Knowledge Base Index](../INDEX.md)
- Review existing issues and discussions
- Ask questions in discussions or create an issue

---

## Code of Conduct

Please be respectful and professional in all interactions. We're building a welcoming community for contributors of all
backgrounds and experience levels.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
