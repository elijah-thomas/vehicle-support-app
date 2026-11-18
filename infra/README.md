# infra

Terraform for everything on the GCP side: the customer's existing systems (Cloud Run API,
Cloud SQL) and the trust that lets the Vercel app reach them (Workload Identity Federation).
Why it's shaped this way: `docs/decisions.md` (D3, D25, D5, D24).

| File | What it defines |
|---|---|
| `environments.tf` | The two environments (staging, production) everything else is created for |
| `identity.tf` | WIF pool/provider for Vercel and the per-environment caller service accounts |
| `github.tf` | WIF pool/provider for GitHub Actions and the per-environment deployer service accounts |
| `cloud-run.tf` | Per-environment API runtime service accounts and private Cloud Run services |
| `database.tf` | Cloud SQL Postgres 17 (IAM login on), one database per environment, IAM database users |
| `registry.tf` | Artifact Registry repo and the dedicated build service account |
| `services.tf` | Required Google APIs (never disabled on destroy; the project is shared) |
| `budget.tf` | Monthly spend alert on Gemini (Vertex AI) usage |
| `sql/grants.sql` | Postgres privileges, which live inside the database and are applied by hand |

## Run it

```bash
cp terraform.tfvars.example terraform.tfvars   # fill in project, Vercel team, migrator, billing account
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)
terraform init
terraform plan
terraform apply
terraform output vercel_env                    # Vercel env vars (production → Production; staging → Preview, Development)
terraform output github_environment_variables  # GitHub Environment variables for deploy-api.yml
```

State lives in the `vehicle-support-tfstate` GCS bucket (versioned). It was created once by
hand, since Terraform needs it before it can run:

```bash
gcloud storage buckets create gs://vehicle-support-tfstate --location=us-central1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://vehicle-support-tfstate --versioning
```

## Not managed here

- **Which image Cloud Run runs**: deployed by `.github/workflows/deploy-api.yml`. Terraform ignores image changes.
- **GitHub Environments and their variables**: set with `gh` from `terraform output github_environment_variables`.
- **Postgres GRANTs**: see `sql/grants.sql`.
- **The Vercel project**: configured with the Vercel CLI (root directory `apps/web`, Fluid
  Compute on, env vars from `terraform output vercel_env`), and functions pinned to `cle1` in
  `apps/web/vercel.json`.

## Tear down

```bash
terraform destroy
```
