import { pgTable, uuid, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const companyFeatureSettings = pgTable(
  "company_feature_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    routine: jsonb("routine").$type<{
      enableRoutineGovernanceExport?: boolean | null;
      enableRoutineAdvancedGraphProfile?: boolean | null;
    }>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdUq: uniqueIndex("company_feature_settings_company_id_uq").on(table.companyId),
  }),
);
