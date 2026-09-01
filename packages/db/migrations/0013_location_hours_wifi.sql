-- Hours and guest wi-fi are per address: a chain's second location keeps its own of both.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS wifi_ssid text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS wifi_password text;

UPDATE locations l
   SET opening_hours = t.opening_hours,
       wifi_ssid = t.wifi_ssid,
       wifi_password = t.wifi_password
  FROM tenants t
 WHERE t.id = l.tenant_id
   AND (t.opening_hours IS NOT NULL OR t.wifi_ssid IS NOT NULL);

ALTER TABLE tenants DROP COLUMN IF EXISTS opening_hours;
ALTER TABLE tenants DROP COLUMN IF EXISTS wifi_ssid;
ALTER TABLE tenants DROP COLUMN IF EXISTS wifi_password;
