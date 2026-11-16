# Decision (D34): monthly spend alert on Gemini (Vertex AI) usage, measured before credits.
# Trade-off: alerts only. GCP budgets don't stop spending, and a billing kill switch would take
# down every workload in this shared project. See docs/decisions.md#spend-alerts
resource "google_billing_budget" "vertex" {
  billing_account = var.billing_account_id
  display_name    = "vehicle-support-app Gemini spend"

  budget_filter {
    projects        = ["projects/${var.project_number}"]
    services        = ["services/C7E2-9256-1C43", "services/AEFD-7695-64FA"] # Vertex AI, Gemini API
    calendar_period = "MONTH"
    # Usage is paid from credits; measured after credits it would read $0 and never alert.
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "25"
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.apis]
}
