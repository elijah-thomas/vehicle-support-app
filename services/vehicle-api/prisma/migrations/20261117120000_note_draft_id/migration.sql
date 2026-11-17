-- Decision (D46): additive only, so the running revision keeps working during a deploy (D13).
-- Nullable, and Postgres lets a unique column hold many NULLs: rep and seeded notes need no ID.
ALTER TABLE "case_notes" ADD COLUMN "draftId" TEXT;
CREATE UNIQUE INDEX "case_notes_draftId_key" ON "case_notes"("draftId");
