import { z } from 'zod';

const stellarAddressSchema = z
  .string()
  .regex(/^[GC][A-Z2-7]{55}$/, 'Expected a Stellar account or contract address');
const symbolSchema = z
  .string()
  .min(1)
  .max(32)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 32, 'Symbol exceeds 32 UTF-8 bytes');
const issueIdSchema = z.number().int().min(0).max(0xffff_ffff);

function eventSchema<T extends z.ZodTypeAny>(
  name: string,
  data: T,
  requireActorMatch = false,
) {
  return z
    .object({
      topics: z.tuple([z.literal(name), stellarAddressSchema]),
      data,
    })
    .strict()
    .superRefine((event, context) => {
      if (
        requireActorMatch &&
        Array.isArray(event.data) &&
        event.topics[1] !== event.data[0]
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['data', 0],
          message: 'Must match the actor address in topics[1]',
        });
      }
    });
}

export const applicationCreatedSchema = eventSchema(
  'app_sub',
  z.tuple([stellarAddressSchema, symbolSchema, issueIdSchema]),
  true,
);
export const applicationWithdrawnSchema = eventSchema(
  'app_wdw',
  z.tuple([stellarAddressSchema, symbolSchema, issueIdSchema]),
  true,
);
export const issueAssignedSchema = eventSchema(
  'assigned',
  z.tuple([stellarAddressSchema, stellarAddressSchema, symbolSchema, issueIdSchema]),
  true,
);
export const assignmentCompletedSchema = eventSchema(
  'completed',
  z.tuple([stellarAddressSchema, stellarAddressSchema, symbolSchema, issueIdSchema]),
  true,
);
export const assignmentRevokedSchema = eventSchema(
  'revoked',
  z.tuple([stellarAddressSchema, stellarAddressSchema, symbolSchema, issueIdSchema]),
  true,
);
export const maintainerRegisteredSchema = eventSchema(
  'maint_reg',
  z.tuple([stellarAddressSchema, symbolSchema]),
);

const schemas = {
  app_sub: applicationCreatedSchema,
  app_wdw: applicationWithdrawnSchema,
  assigned: issueAssignedSchema,
  completed: assignmentCompletedSchema,
  revoked: assignmentRevokedSchema,
  maint_reg: maintainerRegisteredSchema,
} as const;

export type ContractEventTopic = keyof typeof schemas;

export interface ValidatedContractEvent {
  event_type:
    | 'applied'
    | 'withdrew'
    | 'assigned'
    | 'completed'
    | 'revoked'
    | 'maintainer_registered';
  contributor: string | null;
  org_id: string;
  issue_id: number | null;
}

export type EventValidationResult =
  | { success: true; event: ValidatedContractEvent }
  | { success: false; error: string };

export function isSupportedContractEvent(name: string): name is ContractEventTopic {
  return Object.prototype.hasOwnProperty.call(schemas, name);
}

export function validateContractEvent(
  name: ContractEventTopic,
  topics: unknown[],
  data: unknown,
): EventValidationResult {
  const input = { topics, data };
  const fail = (error: z.ZodError): EventValidationResult => ({
    success: false,
    error: error.issues
      .map((issue) => `${issue.path.join('.') || 'event'}: ${issue.message}`)
      .join('; '),
  });

  switch (name) {
    case 'app_sub': {
      const result = schemas.app_sub.safeParse(input);
      if (!result.success) return fail(result.error);
      const [contributor, org_id, issue_id] = result.data.data;
      return { success: true, event: { event_type: 'applied', contributor, org_id, issue_id } };
    }
    case 'app_wdw': {
      const result = schemas.app_wdw.safeParse(input);
      if (!result.success) return fail(result.error);
      const [contributor, org_id, issue_id] = result.data.data;
      return { success: true, event: { event_type: 'withdrew', contributor, org_id, issue_id } };
    }
    case 'assigned':
    case 'completed':
    case 'revoked': {
      const schema = schemas[name];
      const result = schema.safeParse(input);
      if (!result.success) return fail(result.error);
      const [, contributor, org_id, issue_id] = result.data.data;
      return {
        success: true,
        event: { event_type: name, contributor, org_id, issue_id },
      };
    }
    case 'maint_reg': {
      const result = schemas.maint_reg.safeParse(input);
      if (!result.success) return fail(result.error);
      const [, org_id] = result.data.data;
      return {
        success: true,
        event: { event_type: 'maintainer_registered', contributor: null, org_id, issue_id: null },
      };
    }
  }
}
