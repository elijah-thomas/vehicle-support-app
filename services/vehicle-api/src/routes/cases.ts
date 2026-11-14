import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { NotFoundError } from "../errors.js";

export const casesRouter = Router();

const createCaseBody = z.object({
  vin: z.string().toUpperCase().length(17),
  category: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
});

const caseParams = z.object({ id: z.string().min(1) });

const createNoteBody = z.object({
  source: z.enum(["REP", "AI_DRAFT_EDITED"]),
  issue: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(4000),
  nextSteps: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
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
  const body = createNoteBody.parse(req.body);

  const existing = await prisma.case.count({ where: { id } });
  if (!existing) throw new NotFoundError(`No case with id ${id}`);

  const note = await prisma.caseNote.create({ data: { ...body, caseId: id } });

  res.status(201).json(note);
});
