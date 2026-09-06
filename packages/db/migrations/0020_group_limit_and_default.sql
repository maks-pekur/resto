-- A group can cap how many of its modifiers a guest may pick, and a membership can be
-- pre-selected. Both reverse phase-10.6 decisions: D-33 dropped the numeric range and D-05
-- removed default-in. The cap lives on the group (it describes the question); the default
-- lives on the membership (it answers the question for one group only, D-02).

ALTER TABLE public.menu_modifier_groups
    ADD COLUMN IF NOT EXISTS max_selectable smallint;
--> statement-breakpoint
ALTER TABLE public.menu_modifier_groups
    ADD CONSTRAINT menu_modifier_groups_max_selectable_chk
    CHECK (max_selectable IS NULL OR max_selectable > 0);
--> statement-breakpoint

-- `one` already means exactly one; a cap there would be a second source of truth.
ALTER TABLE public.menu_modifier_groups
    ADD CONSTRAINT menu_modifier_groups_max_behaviour_chk
    CHECK (behaviour <> 'one' OR max_selectable IS NULL);
--> statement-breakpoint

ALTER TABLE public.menu_modifier_group_options
    ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- A `one` group can carry at most one default, which no table-level constraint can express
-- (the behaviour lives on the parent row). `SetGroupModifierOptionsService` enforces it.
CREATE INDEX menu_modifier_group_options_default_idx
    ON public.menu_modifier_group_options (tenant_id, modifier_group_id)
    WHERE is_default;
