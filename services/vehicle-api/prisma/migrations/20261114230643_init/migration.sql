-- CreateEnum
CREATE TYPE "Powertrain" AS ENUM ('EV', 'HYBRID', 'GAS');

-- CreateEnum
CREATE TYPE "TelematicsType" AS ENUM ('DTC', 'BATTERY', 'ODOMETER', 'SOFTWARE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARN', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecallStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "NoteSource" AS ENUM ('REP', 'AI_DRAFT_EDITED');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trim" TEXT NOT NULL,
    "powertrain" "Powertrain" NOT NULL,
    "batteryKwh" DOUBLE PRECISION,
    "rangeMiles" INTEGER,
    "engine" TEXT,
    "towingLbs" INTEGER,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "vin" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "softwareVersion" TEXT NOT NULL,
    "installedOptions" TEXT[],

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("vin")
);

-- CreateTable
CREATE TABLE "telematics_events" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "type" "TelematicsType" NOT NULL,
    "code" TEXT,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "value" DOUBLE PRECISION,

    CONSTRAINT "telematics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalls" (
    "id" TEXT NOT NULL,
    "campaignNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "remedy" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,

    CONSTRAINT "recalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_recalls" (
    "vin" TEXT NOT NULL,
    "recallId" TEXT NOT NULL,
    "status" "RecallStatus" NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "vehicle_recalls_pkey" PRIMARY KEY ("vin","recallId")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "source" "NoteSource" NOT NULL,
    "issue" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "nextSteps" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_year_make_model_trim_key" ON "vehicle_models"("year", "make", "model", "trim");

-- CreateIndex
CREATE INDEX "vehicles_customerId_idx" ON "vehicles"("customerId");

-- CreateIndex
CREATE INDEX "telematics_events_vin_recordedAt_idx" ON "telematics_events"("vin", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_campaignNumber_key" ON "recalls"("campaignNumber");

-- CreateIndex
CREATE INDEX "cases_vin_openedAt_idx" ON "cases"("vin", "openedAt");

-- CreateIndex
CREATE INDEX "case_notes_caseId_createdAt_idx" ON "case_notes"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telematics_events" ADD CONSTRAINT "telematics_events_vin_fkey" FOREIGN KEY ("vin") REFERENCES "vehicles"("vin") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_recalls" ADD CONSTRAINT "vehicle_recalls_vin_fkey" FOREIGN KEY ("vin") REFERENCES "vehicles"("vin") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_recalls" ADD CONSTRAINT "vehicle_recalls_recallId_fkey" FOREIGN KEY ("recallId") REFERENCES "recalls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_vin_fkey" FOREIGN KEY ("vin") REFERENCES "vehicles"("vin") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
