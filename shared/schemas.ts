import { z } from 'zod';

export const STATUSES = ['visa_free', 'voa', 'evisa', 'visa_required', 'no_admission', 'self', 'unknown'] as const;
export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;

export const Iso3Schema = z.string().regex(/^[A-Z]{3}$/);

export const EntrySchema = z.object({
  status: StatusSchema,
  days: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  inheritedFrom: Iso3Schema.nullable(),
});
export type Entry = z.infer<typeof EntrySchema>;

/** Chunk file: destination ISO alpha-3 -> entry. */
export const ChunkFileSchema = z.record(Iso3Schema, EntrySchema);
export type ChunkFile = z.infer<typeof ChunkFileSchema>;

export const PassportCodeSchema = z.string().regex(/^[A-Z]{2}$/);

export const PassportInfoSchema = z.object({
  code: PassportCodeSchema,
  iso3: Iso3Schema,
  name: z.string().min(1),
});
export type PassportInfo = z.infer<typeof PassportInfoSchema>;

export const SCHEMA_VERSION = 1;

export const ManifestSchema = z.object({
  schemaVersion: z.number().int(),
  builtAt: z.string().min(1),
  source: z.object({ name: z.string(), url: z.string() }),
  passports: z.array(PassportInfoSchema).min(1),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const ChunkIdSchema = z.enum([
  'europe-west',
  'europe-east',
  'asia-west',
  'asia-central-south',
  'asia-east-southeast',
  'africa-north',
  'africa-sub',
  'americas-north',
  'americas-south',
  'oceania',
]);
export type ChunkId = z.infer<typeof ChunkIdSchema>;

export const PassportIndexSchema = z.object({
  passport: PassportCodeSchema,
  chunks: z.array(
    z.object({
      id: ChunkIdSchema,
      file: z.string().min(1),
      version: z.string().min(1),
      countries: z.number().int().nonnegative(),
    }),
  ),
});
export type PassportIndex = z.infer<typeof PassportIndexSchema>;

// Build-time inputs

export const OverrideSchema = z.object({
  passport: PassportCodeSchema,
  destination: Iso3Schema,
  entry: z.object({
    status: StatusSchema,
    days: z.number().int().positive().nullable().default(null),
    note: z.string().nullable().default(null),
  }),
  reason: z.string().min(1),
});
export type Override = z.infer<typeof OverrideSchema>;
export const OverridesFileSchema = z.array(OverrideSchema);

export const TerritorySchema = z.object({ territory: Iso3Schema, parent: Iso3Schema });
export type Territory = z.infer<typeof TerritorySchema>;
export const TerritoriesFileSchema = z.array(TerritorySchema);

export const ChunkMapSchema = z.record(Iso3Schema, ChunkIdSchema);
export type ChunkMap = z.infer<typeof ChunkMapSchema>;

export const PassportsFileSchema = z.array(PassportInfoSchema).min(1);
