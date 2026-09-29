# Portuguese and English Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate every user-visible application and Electron message between Brazilian Portuguese and English while preserving user-created names and metadata verbatim.

**Architecture:** Use a dependency-free typed translation catalog shared by renderer and Electron. A React provider exposes the active translator; Electron handlers create a translator from persisted settings. Structured error codes replace user-facing service strings at process boundaries.

**Tech Stack:** TypeScript, React Context, Electron, Intl, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-14-responsive-i18n-slicer-integrations-design.md`

## Global Constraints

- Supported locales are exactly `pt-BR` and `en`.
- First run follows the Windows locale and falls back to Portuguese.
- Manual selection persists and updates the renderer without restarting.
- Filenames, folders, paths, notes, tags, and custom slicer names are never translated.
- Do not add localization dependencies.

---

### Task 1: Typed Translation Core

**Files:**
- Create: `src/i18n/catalog.ts`
- Create: `src/i18n/translate.ts`
- Create: `src/i18n/I18nProvider.tsx`
- Create: `tests/unit/i18n.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `type AppLocale = "pt-BR" | "en"`.
- Produces: `resolveAppLocale(value?: string | null): AppLocale`.
- Produces: `translate(locale, key, params?): string` with `TranslationKey = keyof typeof ptBR`.
- Produces: `useI18n(): { locale, t, formatDate, formatNumber }`.

- [ ] **Step 1: Write failing tests for `pt-BR`, `pt`, `en-US`, unsupported locales, parameter replacement, plural branches, and identical catalog keys.**

```ts
expect(resolveAppLocale("en-US")).toBe("en");
expect(resolveAppLocale("fr-FR")).toBe("pt-BR");
expect(translate("en", "thumbnail.remaining", { count: 3 })).toBe("Thumbnails - 3 remaining");
expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort());
```

- [ ] **Step 2: Run `npm test -- tests/unit/i18n.test.ts --reporter=dot` and verify imports/functions are missing.**

- [ ] **Step 3: Implement flat semantic keys, typed parameters, locale-aware plural helpers, `Intl.DateTimeFormat`, and a provider whose translator changes immediately with its locale prop.**

- [ ] **Step 4: Seed catalogs with shared controls, navigation, dialogs, statuses, settings tabs, errors, and file-operation messages used by later tasks.**

- [ ] **Step 5: Run focused tests and commit with `git commit -m "feat: add typed localization core"`.**

### Task 2: Settings Migration and Language Control

**Files:**
- Modify: `electron/services/settingsStore.ts`
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/settingsStore.test.ts`
- Test: `tests/unit/AppLibraryWorkflow.test.tsx`

**Interfaces:**
- Adds: `AppSettings.locale: AppLocale`.
- Changes: `createDefaultSettings(systemLocale?: string): AppSettings`.
- Changes: `createElectronSettingsStore(systemLocale?: string): Promise<SettingsStore>`.

- [ ] **Step 1: Write failing settings tests proving a missing locale migrates from `en-US` to `en`, unsupported locales become `pt-BR`, and an explicit locale survives reload.**

- [ ] **Step 2: Run focused tests and verify the locale field/default behavior fails.**

- [ ] **Step 3: Pass `app.getLocale()` into settings-store creation, normalize only missing/invalid locale values, and wrap the renderer in `I18nProvider` using `settings.locale`.**

- [ ] **Step 4: Add a language selector under appearance with Portuguese and English options. Persist via the existing settings mutation queue and update labels immediately.**

- [ ] **Step 5: Update every test settings fixture with `locale`, run focused tests, and commit with `git commit -m "feat: persist application language"`.**

### Task 3: Renderer Translation Migration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/*.tsx`
- Modify: `src/lib/folderFilters.ts`
- Test: `tests/unit/localizedRendererContract.test.ts`
- Test: existing component tests under `tests/unit/*.test.tsx`

**Interfaces:**
- Consumes: `useI18n()` from Task 1.
- Produces: translated labels, tooltips, empty states, status messages, dialog copy, counts, and dates.

- [ ] **Step 1: Add a failing renderer contract that enumerates all app components and rejects new Portuguese/English UI literals outside the two catalogs, with an explicit allowlist for file extensions and product names.**

- [ ] **Step 2: Run the contract and record every reported literal as the migration checklist.**

- [ ] **Step 3: Migrate shared shell/navigation components first, then grid/filter components, then details/dialog/settings components. Use translation parameters for counts and never concatenate translated fragments.**

- [ ] **Step 4: Replace direct `toLocaleString()` calls with `formatDate`/`formatNumber`; keep paths and user metadata untouched. Add one Portuguese and one English render assertion per major component.**

- [ ] **Step 5: Run all renderer/component tests and commit with `git commit -m "feat: localize renderer in Portuguese and English"`.**

### Task 4: Electron Messages and Structured Errors

**Files:**
- Create: `src/shared/appError.ts`
- Modify: `electron/main.ts`
- Modify: `electron/services/*.ts`
- Modify: `src/App.tsx`
- Modify: `src/i18n/catalog.ts`
- Test: `tests/unit/appError.test.ts`
- Test: `tests/unit/localizedElectronContract.test.ts`

**Interfaces:**
- Produces: `AppErrorCode` union and `AppErrorPayload { code, params? }`.
- Produces: `toAppErrorPayload(error): AppErrorPayload`.
- Produces: `translateAppError(locale, payload): string`.

- [ ] **Step 1: Write failing tests proving known service failures retain stable codes, unknown failures become `unexpected`, and paths supplied as parameters remain verbatim.**

- [ ] **Step 2: Run focused tests and verify structured errors are absent.**

- [ ] **Step 3: Replace user-facing service `Error` messages with stable codes for library, archive, file organization, thumbnail, slicer, image, and settings operations. Keep diagnostic logs in English and do not expose stacks.**

- [ ] **Step 4: Localize Electron dialog titles and convert IPC failures into payloads; translate them in the renderer using the active locale. Migrate operation-success messages to semantic translation keys as well.**

- [ ] **Step 5: Run the literal scan, `npm test -- --reporter=dot`, `npm run build`, and `git diff --check`; commit with `git commit -m "feat: localize Electron operations and errors"`.**

