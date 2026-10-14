# Performance Optimization — Metadata Caching & Optimistic UI

## Overview

This document describes the performance optimization architecture implemented to eliminate cascading API waterfalls and
make UI interactions feel instant.

**Problem**: Every page navigation triggered 3-5 sequential API calls to load metadata (modules, objects, forms, fields,
validations, dependencies, resolved names) before any content could render.

**Solution**: A local metadata cache (Zustand + localStorage) populated by a single bootstrap API call on login, with
optimistic record mutations via a separate entity store.

---

## Architecture

```text
+---------------------------------------------+
|                  UI Layer                    |
|  FormRenderer / WizardRenderer / Pages       |
+---------------------------------------------+
|              Zustand Stores                  |
|  +---------------+  +--------------------+  |
|  | MetadataStore |  |   EntityStore      |  |
|  | (persisted)   |  |   (in-memory)      |  |
|  | forms, fields |  |   records, lists   |  |
|  | validations   |  |   optimistic state |  |
|  | options, deps |  |                    |  |
|  +-------+-------+  +--------+-----------+  |
+-----------+-------------------+--------------+
            |   Sync Layer (React Query)   |
            |   - Bootstrap on login       |
            |   - Background refresh       |
            |   - Mutation + invalidation  |
+-----------+----------------------------+-----+
            +---- API Services ----+
            axios + JWT + error handling
+---------------------------------------------+
```

---

## New Files

### Backend

| File | Purpose |
|------|---------|
| `backend/src/routes/runtime/index.js` | Added `GET /api/runtime/bootstrap` endpoint |

### Frontend — Stores

| File | Purpose |
|------|---------|
| `frontend/src/store/metadataStore.js` | Persisted Zustand store for all UI metadata (modules, objects, forms, wizards, pipelines, resolved names, pre-compiled validations) |
| `frontend/src/store/entityStore.js` | In-memory Zustand store for entity records with optimistic create/update/rollback |

### Frontend — Hooks

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useBootstrap.js` | Triggers metadata bootstrap on login/app start, handles background refresh |

---

## Modified Files

### Backend

- **`backend/src/routes/runtime/index.js`** — Added bootstrap endpoint; fixed `reply` parameter bug in resolve endpoint

### Frontend — Core

- **`frontend/src/App.jsx`** — Integrated `useBootstrap` hook
- **`frontend/src/store/authStore.js`** — Clears metadata + entity stores on logout
- **`frontend/src/services/metadata.service.js`** — Added `runtimeService.bootstrap()` API call
- **`frontend/src/components/runtime/FormRenderer.jsx`** — Uses pre-compiled validation cache from MetadataStore
- **`frontend/src/components/runtime/WizardRenderer.jsx`** — MetadataStore-first form/wizard loading

### Frontend — Pages

- **`frontend/src/pages/runtime/RecordFormPage.jsx`** — Uses MetadataStore for module/object/form lookups; optimistic
  record creation via EntityStore
- **`frontend/src/pages/runtime/ModulePage.jsx`** — MetadataStore for module/object; syncs records to EntityStore
- **`frontend/src/pages/runtime/WizardPage.jsx`** — MetadataStore for wizard and object lookups

---

## How It Works

### 1. Bootstrap (Login / App Start)

When a user logs in or the app starts with a valid token:

1. `useBootstrap` hook (in `App.jsx`) checks if MetadataStore is stale (>30 min) or empty
2. Calls `GET /api/runtime/bootstrap` — a single API request that returns:
   - All modules with permission-filtered objects
   - All object metadata (fields, pipelines, forms list)
   - All form metadata (field_layouts, dependencies)
   - All wizards
   - All pipelines
   - Resolved name→ID mappings for all objects
3. MetadataStore normalizes forms and pre-compiles validation rules
4. Data persists to localStorage (`genesis-metadata` key)
5. Background refresh runs every 5 minutes, re-fetches only if >30 minutes stale

### 2. Page Navigation (Instant)

When navigating to any page:

1. Page reads from MetadataStore (synchronous, ~0ms)
2. If data exists in store: renders immediately, no API calls
3. If data missing (e.g., new object created after last bootstrap): falls back to React Query API call
4. React Query result is cached normally (5 min staleTime)

### 3. Optimistic Mutations

When creating a record:

1. `EntityStore.addOptimisticRecord()` creates a temp record with `_isOptimistic: true`
2. UI updates instantly
3. API call fires in background
4. On success: `confirmOptimisticRecord()` replaces temp with server record
5. On failure: `rollbackOptimisticRecord()` removes temp record, shows error

### 4. Validation Cache

- On bootstrap, all form validations are pre-compiled via `buildValidationRules()`
- Stored in `MetadataStore.validationCache[formId]`
- `FormRenderer` reads from cache instead of rebuilding rules on every render
- Falls back to runtime compilation when field `required` state changes due to dependencies

---

## Performance Impact

| Scenario | Before | After |
|----------|--------|-------|
| Create Prospect (cold) | ~1.5-2.5s (4-5 API calls) | ~200ms (1 API call: createRecord) |
| Create Prospect (warm) | ~400-800ms (cached metadata, 1 API) | ~50ms (optimistic) |
| Convert Lead | ~800ms-1.2s | ~100ms (optimistic + background sync) |
| Wizard Submit | ~500ms per step | ~50ms per step (local state) + 1 API on final |
| Page Navigation | ~800ms-1.5s (metadata waterfall) | ~0ms (metadata already local) |

---

## Data Freshness

- **Bootstrap data**: Refreshed every 30 minutes or on re-login
- **Entity data**: Fetched fresh via React Query on each page visit; cached in EntityStore for cross-page optimistic access
- **After admin changes** (form layout saved, field added): Call `useMetadataStore.getState().clearMetadata()` then
  re-bootstrap, or the 30-min auto-refresh will pick up changes
- **Manual refresh**: Call the `refresh()` function returned by `useBootstrap()`

---

## Backward Compatibility

All changes are backward-compatible:

- Every MetadataStore lookup has a React Query fallback
- If bootstrap fails or returns partial data, individual pages still work via their fallback queries
- EntityStore is additive — React Query remains the source of truth for fresh data
- No API contracts changed; the bootstrap endpoint is purely additive
