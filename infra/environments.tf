# Two copies of the customer's API: staging (deployed from develop, used by Vercel previews)
# and production (deployed from master, used by Vercel production). Each has its own service
# accounts and database, and WIF keeps them apart. See docs/decisions.md#environments
locals {
  environments = {
    production = {
      suffix      = ""
      database    = "vehicle_support"
      branch      = "refs/heads/master"
      vercel_envs = ["production"]
      # Vehicle API requests per minute for the whole Vercel app (D31).
      api_rate_limit = 1200
    }
    staging = {
      suffix         = "-staging"
      database       = "vehicle_support_staging"
      branch         = "refs/heads/develop"
      vercel_envs    = ["preview", "development"]
      api_rate_limit = 1200
    }
  }

  # One entry per (environment, Vercel environment) pair, for the WIF bindings.
  vercel_bindings = merge([
    for env, cfg in local.environments : {
      for vercel_env in cfg.vercel_envs : "${env}:${vercel_env}" => { env = env, vercel_env = vercel_env }
    }
  ]...)
}
