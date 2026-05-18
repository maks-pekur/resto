-- Rollback for 0023_revoke_set_config.sql.
GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO PUBLIC;
