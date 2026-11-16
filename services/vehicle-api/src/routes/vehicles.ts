import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { NotFoundError } from "../errors.js";

export const vehiclesRouter = Router();

// 17 characters, no I, O, or Q (the VIN standard).
const vinParams = z.object({
  vin: z.string().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN must be 17 characters"),
});

// from/to bound a time window (inclusive), so a client can read past events without paging
// through everything newer. codedOnly drops readings without a fault code (battery, odometer),
// which outnumber faults many times over. Newest first either way; limit still caps the response.
const telematicsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    codedOnly: z.enum(["true", "false"]).default("false"),
  })
  .refine(({ from, to }) => !from || !to || Date.parse(from) <= Date.parse(to), "from must not be after to");

async function assertVehicleExists(vin: string) {
  const exists = await prisma.vehicle.count({ where: { vin } });
  if (!exists) throw new NotFoundError(`No vehicle with VIN ${vin}`);
}

vehiclesRouter.get("/:vin", async (req, res) => {
  const { vin } = vinParams.parse(req.params);

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    include: {
      model: true,
      recalls: { include: { recall: true } },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          vehicles: {
            select: { vin: true, model: { select: { year: true, make: true, model: true, trim: true } } },
            orderBy: { purchasedAt: "desc" },
          },
        },
      },
    },
  });
  if (!vehicle) throw new NotFoundError(`No vehicle with VIN ${vin}`);

  res.json(vehicle);
});

vehiclesRouter.get("/:vin/telematics", async (req, res) => {
  const { vin } = vinParams.parse(req.params);
  const { limit, from, to, codedOnly } = telematicsQuery.parse(req.query);
  await assertVehicleExists(vin);

  const events = await prisma.telematicsEvent.findMany({
    where: {
      vin,
      recordedAt: { gte: from && new Date(from), lte: to && new Date(to) },
      ...(codedOnly === "true" && { code: { not: null } }),
    },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });

  res.json(events);
});

vehiclesRouter.get("/:vin/cases", async (req, res) => {
  const { vin } = vinParams.parse(req.params);
  await assertVehicleExists(vin);

  const cases = await prisma.case.findMany({
    where: { vin },
    orderBy: { openedAt: "desc" },
    include: { notes: { orderBy: { createdAt: "desc" } } },
  });

  res.json(cases);
});
