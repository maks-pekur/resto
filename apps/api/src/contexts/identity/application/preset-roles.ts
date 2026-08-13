// T-10-02 (Phase 10): PRESET_ROLES moved to `@resto/domain` so the seed CLI
// (`tools/scripts/seed`, scope:tools) can import it too — the Nx module
// boundary (`packages/config-eslint/base.mjs`) forbids scope:tools from
// depending on scope:api, so a CLI-side sync tool cannot import this data
// from apps/api directly. This re-export keeps every existing apps/api
// import path (`./preset-roles`) working unchanged.
export { PRESET_ROLES, type PresetRoleDefinition } from '@resto/domain';
