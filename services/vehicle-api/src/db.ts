import { AuthTypes, Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { env } from "./env.js";

async function poolConfig(): Promise<PoolConfig> {
  if (!env.INSTANCE_CONNECTION_NAME || !env.DB_IAM_USER) {
    return { connectionString: env.DATABASE_URL };
  }

  // The connector fetches short-lived certs and an IAM login token for the Cloud Run
  // service account, so no database password exists anywhere.
  const connector = new Connector();
  const connection = await connector.getOptions({
    instanceConnectionName: env.INSTANCE_CONNECTION_NAME,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  });
  return { ...connection, user: env.DB_IAM_USER, database: env.DB_NAME, max: 5 };
}

const adapter = new PrismaPg(await poolConfig());

export const prisma = new PrismaClient({ adapter });
