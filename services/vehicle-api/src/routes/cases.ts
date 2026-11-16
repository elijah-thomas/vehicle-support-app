import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ConflictError, NotFoundError } from "../errors.js";

export const casesRouter = Router();

const createCaseBody = z.object({
  vin: z.string().toUpperCase().length(17),
  category: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
});

const caseParams = z.object({ id: z.string().min(1) });

const createNoteBody = z.object({
  vin: z.string().toUpperCase().length(17),
  source: z.enum(["REP", "AI_DRAFT_EDITED"]),
  issue: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(4000),
  nextSteps: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
});

const closeCaseBody = z.object({
  vin: z.string().toUpperCase().length(17),
  resolution: z.string().trim().min(1).max(1000),
});

casesRouter.post("/", async (req, res) => {
  const body = createCaseBody.parse(req.body);

  const vehicle = await prisma.vehicle.findUnique({ where: { vin: body.vin } });
  if (!vehicle) throw new NotFoundError(`No vehicle with VIN ${body.vin}`);

  const created = await prisma.case.create({
    data: { ...body, customerId: vehicle.customerId, status: "OPEN", openedAt: new Date() },
  });

  res.status(201).json(created);
});

casesRouter.post("/:id/notes", async (req, res) => {
  const { id } = caseParams.parse(req.params);
  const { vin, ...note } = createNoteBody.parse(req.body);

  // The caller names the vehicle it has open, so a note can never land on another vehicle's case.
  // See docs/decisions.md#note-ownership
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
