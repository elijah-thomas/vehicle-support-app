-- Postgres privileges live inside the database, so Terraform can't manage them.
-- Run once as the built-in postgres user (reset its password with gcloud first), via
-- the Cloud SQL Auth Proxy. See infra/README.md
--
-- Least privilege: the migrator owns the schema; the API can read and write rows but
-- cannot change the schema.

GRANT USAGE, CREATE ON SCHEMA public TO "MIGRATOR_EMAIL";
GRANT USAGE ON SCHEMA public TO "vehicle-support-api@PROJECT_ID.iam";

-- Then, connected as the migrator after running `prisma migrate deploy`:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
--   TO "vehicle-support-api@PROJECT_ID.iam";
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "vehicle-support-api@PROJECT_ID.iam";
