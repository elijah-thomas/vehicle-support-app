# Decision (D19, D22): the customer's system of record: one instance, one database per environment.
# Cloud Run logs in with its service account identity (IAM database authentication), so no
# database password exists. Trade-off: public IP with no authorized networks rather than private
# IP; only the IAM-checked connector can connect. See docs/decisions.md#db-access
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
  for_each = local.environments
  name     = each.value.database
  instance = google_sql_database_instance.main.name
}

# Cloud SQL drops ".gserviceaccount.com" from service account database usernames.
resource "google_sql_user" "api" {
  for_each = local.environments
  name     = trimsuffix(google_service_account.api[each.key].email, ".gserviceaccount.com")
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

# The CI deployer owns each database's schema and runs migrations.
resource "google_sql_user" "deployer" {
  for_each = local.environments
  name     = trimsuffix(google_service_account.deployer[each.key].email, ".gserviceaccount.com")
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

# A human IAM login for one-off inspection through the Cloud SQL Auth Proxy.
resource "google_sql_user" "migrator" {
  name     = var.db_migrator_email
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_USER"
}

moved {
  from = google_sql_database.app
  to   = google_sql_database.app["production"]
}
moved {
  from = google_sql_user.api
  to   = google_sql_user.api["production"]
}
