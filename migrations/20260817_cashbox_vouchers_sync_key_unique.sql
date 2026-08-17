-- No row is deleted or merged by this migration.
DO $$
DECLARE duplicate_groups integer;
BEGIN
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
        SELECT sync_key FROM cashbox_vouchers
        WHERE sync_key IS NOT NULL AND BTRIM(sync_key) <> ''
        GROUP BY sync_key HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_groups > 0 THEN
        RAISE EXCEPTION 'CASHBOX_SYNC_KEY_DUPLICATES: % duplicate sync_key groups; no rows were changed.', duplicate_groups;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_cashbox_vouchers_sync_key_unique;
CREATE UNIQUE INDEX idx_cashbox_vouchers_sync_key_unique ON cashbox_vouchers(sync_key);
