import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ConflictError, NotFoundError } from "../errors.js";

export const casesRouter = Router();

const vin = z.string().toUpperCase().length(17);
const issue = z.string().trim().min(1).max(300);
const summary = z.string().trim().min(1).max(4000);
const nextStep = z.string().trim().min(1).max(500);

// A rep's quick note needs only a summary. An AI-drafted note always carries all three fields,
// as the call summary produces them (D16).
const note = z.discriminatedUnion("source", [
  z.object({ source: z.literal("REP"), issue: issue.optional(), summary, nextSteps: z.array(nextStep).max(10).default([]) }),
  z.object({ source: z.literal("AI_DRAFT_EDITED"), issue, summary, nextSteps: z.array(nextStep).min(1).max(10) }),
]);

const createNoteBody = z.intersection(z.object({ vin }), note);

// A new case can carry its first note, so the two are written together or not at all.
const createCaseBody = z.object({
  vin,
  category: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  note: note.optional(),
});

const caseParams = z.object({ id: z.string().min(1) });
const noteParams = caseParams.extend({ noteId: z.string().min(1) });

const closeCaseBody = z.object({ vin, resolution: z.string().trim().min(1).max(1000) });
const reopenCaseBody = z.object({ vin, reason: z.string().trim().min(1).max(1000) });
const vinBody = z.object({ vin });

const liveNotes = { where: { removedAt: null }, orderBy: { createdAt: "desc" } } as const;

casesRouter.post("/", async (req, res) => {
  const { note, ...body } = createCaseBody.parse(req.body);

  const vehicle = await prisma.vehicle.findUnique({ where: { vin: body.vin } });
  if (!vehicle) throw new NotFoundError(`No vehicle with VIN ${body.vin}`);

  // A nested create runs in one transaction: no case is left without the note it was opened for.
  const created = await prisma.case.create({
    data: {
      ...body,
      customerId: vehicle.customerId,
      status: "OPEN",
      openedAt: new Date(),
      ...(note && { notes: { create: note } }),
    },
    include: { notes: true },
  });

  res.status(201).json(created);
});

casesRouter.post("/:id/notes", async (req, res) => {
  const { id } = caseParams.parse(req.params);
  const { vin, ...note } = createNoteBody.parse(req.body);

  // Decision (D25): the caller names the vehicle it has open, and the system of record refuses a
  // case that isn't that vehicle's, so every client gets the check. See docs/decisions.md#note-ownership
  const existing = await prisma.case.count({ where: { id, vin } });
  if (!existing) throw new NotFoundError(`No case with id ${id} for VIN ${vin}`);

  const created = await prisma.caseNote.create({ data: { ...note, caseId: id } });

  res.status(201).json(created);
});

casesRouter.post("/:id/close", async (req, res) => {
  const { id } = caseParams.parse(req.params);
  const { vin, resolution } = closeCaseBody.parse(req.body);

  // Same ownership rule as notes: only the vehicle's own case can be closed.
  // See docs/decisions.md#note-ownership
  const existing = await prisma.case.count({ where: { id, vin } });
  if (!existing) throw new NotFoundError(`No case with id ${id} for VIN ${vin}`);

  // The status check is in the update itself, so two closes racing can't both succeed.
  const { count } = await prisma.case.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date(), resolution },
  });
  if (!count) throw new ConflictError(`Case ${id} is already closed`);

  res.json(await prisma.case.findUniqueOrThrow({ where: { id } }));
});

// Reopening clears the resolution, so the reason and the old resolution are kept as a rep note:
// the case's history still reads in order. Both writes happen together or not at all.
casesRouter.post("/:id/reopen", async (req, res) => {
  const { id } = caseParams.parse(req.params);
  const { vin, reason } = reopenCaseBody.parse(req.body);

  // Same ownership rule as notes and close. See docs/decisions.md#note-ownership
  const existing = await prisma.case.findFirst({ where: { id, vin } });
  if (!existing) throw new NotFoundError(`No case with id ${id} for VIN ${vin}`);

  const reopened = await prisma.$transaction(async (tx) => {
    // The status check is in the update itself, so two reopens racing can't both succeed.
    const { count } = await tx.case.updateMany({
      where: { id, status: "CLOSED" },
      data: { status: "OPEN", closedAt: null, resolution: null },
    });
    if (!count) throw new ConflictError(`Case ${id} is already open`);

    await tx.caseNote.create({
      data: {
        caseId: id,
        source: "REP",
        issue: "Case reopened",
        summary: existing.resolution ? `${reason}\n\nPrevious resolution: ${existing.resolution}` : reason,
        nextSteps: [],
      },
    });
    return tx.case.findUniqueOrThrow({ where: { id }, include: { notes: liveNotes } });
  });

  res.json(reopened);
});

// Removing marks the note instead of deleting it, so restore (Undo) brings it back unchanged.
// Each write names the vehicle, and a note on another vehicle's case is a 404 (D25).
async function findOwnedNote(id: string, noteId: string, vin: string) {
  const found = await prisma.caseNote.findFirst({ where: { id: noteId, caseId: id, case: { vin } } });
  if (!found) throw new NotFoundError(`No note ${noteId} on case ${id} for VIN ${vin}`);
}

casesRouter.post("/:id/notes/:noteId/remove", async (req, res) => {
  const { id, noteId } = noteParams.parse(req.params);
  const { vin } = vinBody.parse(req.body);
  await findOwnedNote(id, noteId, vin);

  const { count } = await prisma.caseNote.updateMany({
    where: { id: noteId, removedAt: null },
    data: { removedAt: new Date() },
  });
  if (!count) throw new ConflictError(`Note ${noteId} is already removed`);

  res.json(await prisma.caseNote.findUniqueOrThrow({ where: { id: noteId } }));
});

casesRouter.post("/:id/notes/:noteId/restore", async (req, res) => {
  const { id, noteId } = noteParams.parse(req.params);
  const { vin } = vinBody.parse(req.body);
  await findOwnedNote(id, noteId, vin);

  const { count } = await prisma.caseNote.updateMany({
    where: { id: noteId, removedAt: { not: null } },
    data: { removedAt: null },
  });
  if (!count) throw new ConflictError(`Note ${noteId} isn't removed`);

  res.json(await prisma.caseNote.findUniqueOrThrow({ where: { id: noteId } }));
});
