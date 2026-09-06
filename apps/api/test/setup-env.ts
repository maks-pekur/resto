// 07.5-13 made PUBLIC_APEX_DOMAIN load-bearing: `guestHostForTenant` throws without it, and
// tenant provisioning composes a guest URL, so every suite booting the app through ConfigModule
// needs one. Deliberately not a schema default — two specs pass `undefined` on purpose to prove
// the throw still happens.
process.env.PUBLIC_APEX_DOMAIN ??= 'resto.app';
