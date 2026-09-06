-- One photo becomes a list: a venue shows its room in more than one shot.
UPDATE tenants
   SET theme = (theme - 'coverUrl')
       || jsonb_build_object(
            'coverUrls',
            CASE
              WHEN theme->>'coverUrl' IS NULL THEN '[]'::jsonb
              ELSE jsonb_build_array(theme->>'coverUrl')
            END)
 WHERE theme IS NOT NULL
   AND theme ? 'coverUrl';
