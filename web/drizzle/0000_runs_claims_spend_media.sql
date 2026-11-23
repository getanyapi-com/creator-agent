CREATE SEQUENCE "public"."run_owners" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 4294967296 CACHE 1;--> statement-breakpoint
CREATE TABLE "house_spend" (
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"run_id" text NOT NULL,
	"usd" numeric NOT NULL,
	CONSTRAINT "house_spend_day_kind_run_id_pk" PRIMARY KEY("day","kind","run_id")
);
--> statement-breakpoint
CREATE TABLE "question_claims" (
	"run_id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_media" (
	"run_id" text NOT NULL,
	"file" text NOT NULL,
	"type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	CONSTRAINT "run_media_run_id_file_pk" PRIMARY KEY("run_id","file")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"asker_id" text NOT NULL,
	"owner" bigint NOT NULL,
	"removed_at" timestamp with time zone,
	"record" jsonb,
	"display" jsonb,
	"progress" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "question_claims_account_at_idx" ON "question_claims" USING btree ("account_id","at");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_started_at_idx" ON "runs" USING btree ("started_at");