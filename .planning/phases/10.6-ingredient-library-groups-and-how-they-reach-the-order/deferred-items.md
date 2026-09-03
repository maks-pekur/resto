# Deferred Items

Out-of-scope discoveries logged during execution, per the executor's scope-boundary rule
(fix only what the current task's own changes caused).

## From plan 13 (group editor rewrite)

- **`menu.modifierGroups.groupMainDescription`** (ru/en/es) still reads "Параметры группы:
  название и количество выбираемых вариантов (макс. 0 — без ограничений)." / "Group settings:
  name and how many options can be selected (max 0 = unlimited)." This describes the
  `minSelectable`/`maxSelectable` fields plan 08 removed from the contract and plan 13 removed
  from `modifier-group-form.tsx` — the copy is stale, not caused by plan 13's own edits (the
  staleness dates to plan 08's contract regeneration). `menu.modifierGroups.*` and the three
  locale JSON files are outside plan 13's `files_modified` list, and editing them here risked
  colliding with sibling wave-9 agents. Needs a follow-up copy pass to describe the new
  display/behaviour/required fields instead.
