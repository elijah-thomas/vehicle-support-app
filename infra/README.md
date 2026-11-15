# infra

Terraform for everything on the GCP side: the customer's existing systems (Cloud Run API,
Cloud SQL) and the trust that lets the Vercel app reach them (Workload Identity Federation).
Why it's shaped this way: `docs/decisions.md` (D3, D18, D19, D20).

| File | What it defines |
|---|---|
| `identity.tf` | WIF pool/provider for Vercel, the `vehicle-support-caller` service account and its two permissions |
| `cloud-run.tf` | API runtime service account and the private Cloud Run service |
| `database.tf` | Cloud SQL Postgres 17 (IAM login on), the database, and IAM database users |
| `registry.tf` | Artifact Registry repo and the dedicated build service account |
| `services.tf` | Required Google APIs (never disabled on destroy; the project is shared) |
| `sql/grants.sql` | Postgres privileges, which live inside the database and are applied by hand |

## Run it

```bash
cp terraform.tfvars.example terraform.tfvars   # fill in project, Vercel team, migrator email
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)
terraform init
terraform plan
terraform apply
terraform output vercel_env   # values for the Vercel project's environment variables
```

State lives in the `vehicle-support-tfstate` GCS bucket (versioned). It was created once by
hand, since Terraform needs it before it can run:

```bash
gcloud storage buckets create gs://vehicle-support-tfstate --location=us-central1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://vehicle-support-tfstate --versioning
```

## Not managed here

- **Which image Cloud Run runs**: deployed by GitHub Actions. Terraform ignores image changes.
- **Postgres GRANTs**: see `sql/grants.sql`.
- **The Vercel project**: configured with the Vercel CLI (root directory `apps/web`, Fluid
  Compute on, env vars from `terraform output vercel_env`).

## Tear down

```bash
terraform destroy
```
