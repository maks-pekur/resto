ALTER TABLE tenants ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wifi_ssid text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wifi_password text;
