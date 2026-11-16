output "instance_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "vercel_env" {
  description = "Vercel environment variables per environment (none are secrets). Production → Production; staging → Preview and Development."
  value = {
    for env in keys(local.environments) : env => {
      VEHICLE_API_URL                        = google_cloud_run_v2_service.api[env].uri
      GCP_PROJECT_NUMBER                     = var.project_number
      GCP_WORKLOAD_IDENTITY_POOL_ID          = google_iam_workload_identity_pool.vercel.workload_identity_pool_id
      GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = google_iam_workload_identity_pool_provider.vercel.workload_identity_pool_provider_id
      GCP_SERVICE_ACCOUNT_EMAIL              = google_service_account.caller[env].email
    }
  }
}

output "github_environment_variables" {
  description = "Variables for each GitHub Environment used by the deploy workflow."
  value = {
    for env, cfg in local.environments : env => {
      GCP_PROJECT_ID           = var.project_id
      GCP_REGION               = var.region
      GCP_WIF_PROVIDER         = google_iam_workload_identity_pool_provider.github.name
      GCP_DEPLOYER_SA          = google_service_account.deployer[env].email
      CLOUD_RUN_SERVICE        = google_cloud_run_v2_service.api[env].name
      INSTANCE_CONNECTION_NAME = google_sql_database_instance.main.connection_name
      DB_NAME                  = cfg.database
      DB_MIGRATOR_USER         = google_sql_user.deployer[env].name
    }
  }
}
