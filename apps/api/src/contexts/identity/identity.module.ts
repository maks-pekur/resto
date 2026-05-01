import { Module } from '@nestjs/common';
import { JoseJwtVerifier } from './infrastructure/jose-jwt-verifier';
import { KeycloakAdminAdapter } from './infrastructure/keycloak-admin.adapter';
import { JWT_VERIFIER, KEYCLOAK_ADMIN_PORT } from './domain/ports';
import { AuthGuard } from './interfaces/http/auth.guard';
import { RolesGuard } from './interfaces/http/roles.guard';

@Module({
  providers: [
    { provide: JWT_VERIFIER, useClass: JoseJwtVerifier },
    { provide: KEYCLOAK_ADMIN_PORT, useClass: KeycloakAdminAdapter },
    AuthGuard,
    RolesGuard,
  ],
  exports: [JWT_VERIFIER, KEYCLOAK_ADMIN_PORT, AuthGuard, RolesGuard],
})
export class IdentityModule {}
