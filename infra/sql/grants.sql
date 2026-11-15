-- Postgres privileges live inside the database, so Terraform can't manage them.
-- Run once per environment as the built-in postgres user, through the Cloud SQL Auth Proxy:
--
--   psql "host=127.0.0.1 port=5441 user=postgres dbname=<database>" \
--     -v db=<database> \
--     -v deployer='<deployer-sa>@<project>.iam' \
--     -v api='<api-sa>@<project>.iam' \
--     -f infra/sql/grants.sql
--
-- Result, per environment:
--   deployer  owns the schema and runs migrations (CI only)
--   api       reads and writes rows; cannot change the schema
--   nobody else, including the other environment's accounts, can connect

REVOKE CONNECT ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"deployer", :"api";

GRANT USAGE, CREATE ON SCHEMA public TO :"deployer";
GRANT USAGE ON SCHEMA public TO :"api";

-- Tables the deployer creates in future migrations are usable by the API automatically.
GRANT :"deployer" TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE :"deployer" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"api";

-- One-time, production only (2026-11-14): the first migration ran as a human login, so its
-- tables were transferred to the deployer with:
--   GRANT "<human>" TO postgres;
--   REASSIGN OWNED BY "<human>" TO "<production-deployer>";
--   REVOKE "<human>" FROM postgres;
