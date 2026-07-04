import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CurrencyValue } from '@resto/domain';

const RoleNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9\s\-_]+$/)
  .transform((s) => s.toLowerCase());

export const CreateRoleInputSchema = z.object({
  roleName: RoleNameSchema,
  permission: z.record(z.string(), z.array(z.string())),
});
export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>;
export class CreateRoleInputDto extends createZodDto(CreateRoleInputSchema) {}

export const UpdateRoleInputSchema = z.object({
  permission: z.record(z.string(), z.array(z.string())),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>;
export class UpdateRoleInputDto extends createZodDto(UpdateRoleInputSchema) {}

export const SignUpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  displayName: z.string().min(2).max(120),
  defaultCurrency: CurrencyValue,
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
});
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

export class SignUpInputDto extends createZodDto(SignUpInputSchema) {}
