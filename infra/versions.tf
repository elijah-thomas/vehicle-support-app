terraform {
  required_version = ">= 1.14"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.11"
    }
  }

  # Created once by hand (it has to exist before Terraform can use it). See infra/README.md
  backend "gcs" {
    bucket = "vehicle-support-tfstate"
    prefix = "vehicle-support-app"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
