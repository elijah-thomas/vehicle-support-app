# Runtime identity per environment: may connect to Cloud SQL and log in as its IAM database
# user. Postgres GRANTs (infra/sql/grants.sql) limit each one to its own database.
resource "google_service_account" "api" {
  for_each     = local.environments
  account_id   = "vehicle-support-api${each.value.suffix}"
  display_name = "vehicle-support-app API runtime (${each.key})"
}

locals {
  sql_roles = ["roles/cloudsql.client", "roles/cloudsql.instanceUser"]
  api_sql_grants = {
    for pair in setproduct(keys(local.environments), local.sql_roles) :
    "${pair[0]}:${pair[1]}" => { env = pair[0], role = pair[1] }
  }
}

resource "google_project_iam_member" "api_sql" {
  for_each = local.api_sql_grants
  project  = var.project_id
  role     = each.value.role
  member   = google_service_account.api[each.value.env].member
}

# Terraform owns each service's shape (identity, env, scaling, who may call it).
# GitHub Actions owns which image is running, so Terraform ignores image changes.
resource "google_cloud_run_v2_service" "api" {
  for_each            = local.environments
  name                = "vehicle-support-api${each.value.suffix}"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api[each.key].email

    scaling {
      max_instance_count = 3
    }

    containers {
      # First deploy only; CI replaces it.
      image = "${var.region}-docker.pkg.dev/${var.project_id}/vehicle-support/vehicle-api:spike"

      resources {
        limits            = { cpu = "1000m", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.main.connection_name
      }
      env {
        name  = "DB_IAM_USER"
        value = google_sql_user.api[each.key].name
      }
      env {
        name  = "DB_NAME"
        value = google_sql_database.app[each.key].name
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
      template[0].labels,
      template[0].annotations,
    ]
  }
}

moved {
  from = google_service_account.api
  to   = google_service_account.api["production"]
}
moved {
  from = google_project_iam_member.api_sql["roles/cloudsql.client"]
  to   = google_project_iam_member.api_sql["production:roles/cloudsql.client"]
}
moved {
  from = google_project_iam_member.api_sql["roles/cloudsql.instanceUser"]
  to   = google_project_iam_member.api_sql["production:roles/cloudsql.instanceUser"]
}
moved {
  from = google_cloud_run_v2_service.api
  to   = google_cloud_run_v2_service.api["production"]
}
