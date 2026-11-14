import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { NotFoundError } from "../errors.js";

export const customersRouter = Router();

const lookupQuery = z.object({ email: z.email() });

customersRouter.get("/", async (req, res) => {
  const { email } = lookupQuery.parse(req.query);

  const customer = await prisma.customer.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      vehicles: {
        select: {
          vin: true,
          color: true,
          model: { select: { year: true, make: true, model: true, trim: true } },
        },
      },
    },
  });
  if (!customer) throw new NotFoundError(`No customer with email ${email}`);

  res.json(customer);
});
