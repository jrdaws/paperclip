import type { Db } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { companies, companyFeatureSettings } from "@paperclipai/db";
import type {
  CompanyRoutineFeatureOverrides,
  CompanyRoutineFeatureSettings,
  InstanceExperimentalSettings,
  UpdateCompanyRoutineFeatureOverrides,
} from "@paperclipai/shared";
import { notFound } from "../errors.js";

function normalizeRoutineOverrides(raw: unknown): CompanyRoutineFeatureOverrides {
  if (!raw || typeof raw !== "object") {
    return {
      enableRoutineGovernanceExport: null,
      enableRoutineAdvancedGraphProfile: null,
    };
  }
  const value = raw as Record<string, unknown>;
  const normalizeBoolOrNull = (input: unknown): boolean | null => {
    if (input === true || input === false) return input;
    return null;
  };
  return {
    enableRoutineGovernanceExport: normalizeBoolOrNull(value.enableRoutineGovernanceExport),
    enableRoutineAdvancedGraphProfile: normalizeBoolOrNull(value.enableRoutineAdvancedGraphProfile),
  };
}

export function companyFeatureSettingsService(db: Db) {
  async function assertCompanyExists(companyId: string) {
    const company = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!company) throw notFound("Company not found");
  }

  return {
    getRoutineOverrides: async (companyId: string): Promise<CompanyRoutineFeatureOverrides> => {
      await assertCompanyExists(companyId);
      const row = await db
        .select({ routine: companyFeatureSettings.routine })
        .from(companyFeatureSettings)
        .where(eq(companyFeatureSettings.companyId, companyId))
        .then((rows) => rows[0] ?? null);
      return normalizeRoutineOverrides(row?.routine);
    },

    updateRoutineOverrides: async (
      companyId: string,
      patch: UpdateCompanyRoutineFeatureOverrides,
    ): Promise<CompanyRoutineFeatureOverrides> => {
      await assertCompanyExists(companyId);
      const existing = await db
        .select()
        .from(companyFeatureSettings)
        .where(eq(companyFeatureSettings.companyId, companyId))
        .then((rows) => rows[0] ?? null);
      const previous = normalizeRoutineOverrides(existing?.routine);
      const next: CompanyRoutineFeatureOverrides = {
        enableRoutineGovernanceExport:
          patch.enableRoutineGovernanceExport !== undefined
            ? patch.enableRoutineGovernanceExport
            : previous.enableRoutineGovernanceExport,
        enableRoutineAdvancedGraphProfile:
          patch.enableRoutineAdvancedGraphProfile !== undefined
            ? patch.enableRoutineAdvancedGraphProfile
            : previous.enableRoutineAdvancedGraphProfile,
      };
      const now = new Date();
      if (!existing) {
        await db.insert(companyFeatureSettings).values({
          companyId,
          routine: next,
          updatedAt: now,
        });
      } else {
        await db
          .update(companyFeatureSettings)
          .set({
            routine: next,
            updatedAt: now,
          })
          .where(and(eq(companyFeatureSettings.id, existing.id), eq(companyFeatureSettings.companyId, companyId)));
      }
      return next;
    },

    resolveRoutineFeatureSettings: async (
      companyId: string,
      defaults: InstanceExperimentalSettings,
    ): Promise<CompanyRoutineFeatureSettings> => {
      await assertCompanyExists(companyId);
      const overrides = await (async () => {
        const row = await db
          .select({ routine: companyFeatureSettings.routine })
          .from(companyFeatureSettings)
          .where(eq(companyFeatureSettings.companyId, companyId))
          .then((rows) => rows[0] ?? null);
        return normalizeRoutineOverrides(row?.routine);
      })();
      return {
        companyId,
        overrides,
        effective: {
          enableRoutineGovernanceExport:
            overrides.enableRoutineGovernanceExport ?? defaults.enableRoutineGovernanceExport,
          enableRoutineAdvancedGraphProfile:
            overrides.enableRoutineAdvancedGraphProfile ?? defaults.enableRoutineAdvancedGraphProfile,
        },
      };
    },
  };
}
