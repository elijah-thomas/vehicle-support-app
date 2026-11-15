output "vehicle_api_url" {
  description = "Set as VEHICLE_API_URL in the Vercel project."
  value       = google_cloud_run_v2_service.api.uri
}

output "instance_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "vercel_env" {
  description = "Environment variables for the Vercel project (none are secrets)."
  value = {
    VEHICLE_API_URL                        = google_cloud_run_v2_service.api.uri
    GCP_PROJECT_NUMBER                     = var.project_number
    GCP_WORKLOAD_IDENTITY_POOL_ID          = google_iam_workload_identity_pool.vercel.workload_identity_pool_id
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = google_iam_workload_identity_pool_provider.vercel.workload_identity_pool_provider_id
    GCP_SERVICE_ACCOUNT_EMAIL              = google_service_account.caller.email
  }
}
