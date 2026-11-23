CREATE TABLE "wallet_connections" (
	"account_id" text PRIMARY KEY NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "wallet_stop" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "media_saved_at" timestamp with time zone;