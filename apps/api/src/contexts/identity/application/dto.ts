import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CountryCodeValue } from '@resto/domain';

const RoleNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9\s\-_]+$/)
  .transform((s) => s.toLowerCase());

const PermissionSchema = z
  .record(z.string().min(1).max(64), z.array(z.string().min(1).max(64)).max(64))
  .refine((p) => Object.keys(p).length <= 64, { message: 'too many permission resources' });

export const CreateRoleInputSchema = z.object({
  roleName: RoleNameSchema,
  permission: PermissionSchema,
});
export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>;
export class CreateRoleInputDto extends createZodDto(CreateRoleInputSchema) {}

export const UpdateRoleInputSchema = z.object({
  permission: PermissionSchema,
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>;
export class UpdateRoleInputDto extends createZodDto(UpdateRoleInputSchema) {}

export const AssignRoleInputSchema = z.object({
  memberId: z.string().uuid(),
  role: z.string().min(1).max(64),
});
export type AssignRoleInput = z.infer<typeof AssignRoleInputSchema>;
export class AssignRoleInputDto extends createZodDto(AssignRoleInputSchema) {}

export const SignUpInputSchema = z.object({
  // D-27: the PERSON's name — goes to the Better Auth user, never to the
  // organization. The organization's real name is collected at onboarding.
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  // D-32/D-34: collected here, applied to the organization at onboarding;
  // currency and locale are ALWAYS derived from it, never separate inputs.
  country: CountryCodeValue,
});
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

export class SignUpInputDto extends createZodDto(SignUpInputSchema) {}

export const FinalizeTenantSetupInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});
export type FinalizeTenantSetupInput = z.infer<typeof FinalizeTenantSetupInputSchema>;
export class FinalizeTenantSetupInputDto extends createZodDto(FinalizeTenantSetupInputSchema) {}
