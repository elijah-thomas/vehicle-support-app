# The customer's system of record. Cloud Run logs in with its service account identity
# (IAM database authentication), so no database password exists. See docs/decisions.md#db-access
resource "google_sql_database_instance" "main" {
  name             = "vehicle-support-db"
  database_version = "POSTGRES_17"
  region           = var.region

  settings {
    edition           = "ENTERPRISE"
    tier              = "db-f1-micro"
    disk_type         = "PD_SSD"
    disk_size         = 10
    availability_type = "ZONAL"

    enable_dataplex_integration = true

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    backup_configuration {
      enabled    = true
      start_time = "08:00"
    }

    # Public IP with no authorized networks: only the Cloud SQL connector (IAM-checked,
    # mTLS) can connect. Private IP is the production design.
    ip_configuration {
      ipv4_enabled = true
    }
  }
}

resource "google_sql_database" "app" {
  name     = "vehicle_support"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "api" {
  # Cloud SQL drops ".gserviceaccount.com" from service account database usernames.
  name     = trimsuffix(google_service_account.api.email, ".gserviceaccount.com")
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

import {
  to = google_sql_database_instance.main
  id = "projects/${var.project_id}/instances/vehicle-support-db"
}
import {
  to = google_sql_database.app
  id = "projects/${var.project_id}/instances/vehicle-support-db/databases/vehicle_support"
}
import {
  to = google_sql_user.api
  id = "${var.project_id}/vehicle-support-db/vehicle-support-api@${var.project_id}.iam"
}

# A human IAM login used to run migrations through the Cloud SQL Auth Proxy.
resource "google_sql_user" "migrator" {
  name     = var.db_migrator_email
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_USER"
}

import {
  to = google_sql_user.migrator
  id = "${var.project_id}/vehicle-support-db/${var.db_migrator_email}"
}
