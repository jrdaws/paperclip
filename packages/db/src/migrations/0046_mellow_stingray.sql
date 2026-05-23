CREATE TABLE "routine_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_routine_id" uuid,
	"routine_profile" jsonb NOT NULL,
	"advanced_graph_profile" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routine_templates" ADD CONSTRAINT "routine_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routine_templates" ADD CONSTRAINT "routine_templates_source_routine_id_routines_id_fk" FOREIGN KEY ("source_routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "routine_templates_company_updated_idx" ON "routine_templates" USING btree ("company_id","updated_at");
--> statement-breakpoint
CREATE INDEX "routine_templates_company_name_idx" ON "routine_templates" USING btree ("company_id","name");
--> statement-breakpoint
CREATE INDEX "routine_templates_source_routine_idx" ON "routine_templates" USING btree ("source_routine_id");
