// Synthetic data for a fictional automaker, "Meridian Motors". No real customer or company data.
// Each customer is a story the agent should reason about. See docs/decisions.md#data-model
//
// VINs start with "0MR", a manufacturer code no real automaker uses.
// Dates are relative to when the seed runs, so the stories always look recent.

import { prisma } from "../src/db.js";

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function reset() {
  await prisma.caseNote.deleteMany();
  await prisma.case.deleteMany();
  // Deleting rows keeps the identity counter, so without this a reseed renumbers every case
  // (CS-24112 instead of CS-24103). ALTER needs the table owner, which the seed runs as.
  await prisma.$executeRaw`ALTER TABLE "cases" ALTER COLUMN "number" RESTART WITH 24101`;
  await prisma.vehicleRecall.deleteMany();
  await prisma.recall.deleteMany();
  await prisma.telematicsEvent.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.vehicleModel.deleteMany();
  await prisma.customer.deleteMany();
}

async function seedModels() {
  const asterLongRange = await prisma.vehicleModel.create({
    data: {
      year: 2024, make: "Meridian", model: "Aster EV", trim: "Long Range",
      powertrain: "EV", batteryKwh: 102, rangeMiles: 310, towingLbs: 3500,
    },
  });
  const asterStandard = await prisma.vehicleModel.create({
    data: {
      year: 2022, make: "Meridian", model: "Aster EV", trim: "Standard",
      powertrain: "EV", batteryKwh: 75, rangeMiles: 240, towingLbs: 1500,
    },
  });
  const kestrel2023 = await prisma.vehicleModel.create({
    data: {
      year: 2023, make: "Meridian", model: "Kestrel 1500", trim: "Crew Cab",
      powertrain: "GAS", engine: "5.3L V8", towingLbs: 11000,
    },
  });
  const kestrel2021 = await prisma.vehicleModel.create({
    data: {
      year: 2021, make: "Meridian", model: "Kestrel 1500", trim: "Work Truck",
      powertrain: "GAS", engine: "2.7L Turbo I4", towingLbs: 9500,
    },
  });
  const solace2026 = await prisma.vehicleModel.create({
    data: {
      year: 2026, make: "Meridian", model: "Solace", trim: "Hybrid Premier",
      powertrain: "HYBRID", engine: "2.5L I4 Hybrid", rangeMiles: 560, towingLbs: 2000,
    },
  });
  const solace2023 = await prisma.vehicleModel.create({
    data: {
      year: 2023, make: "Meridian", model: "Solace", trim: "Hybrid",
      powertrain: "HYBRID", engine: "2.5L I4 Hybrid", rangeMiles: 540, towingLbs: 2000,
    },
  });
  return { asterLongRange, asterStandard, kestrel2023, kestrel2021, solace2026, solace2023 };
}

async function main() {
  await reset();
  const models = await seedModels();

  // Story 1: recurring fault. Same battery-coolant DTC across three cases in eight months;
  // each dealer visit "fixed" it. The agent should spot the pattern and suggest escalation.
  await prisma.customer.create({
    data: {
      email: "dana.whitfield@example.com", firstName: "Dana", lastName: "Whitfield",
      phone: "555-0101",
      vehicles: {
        create: {
          vin: "0MRAE4LR5RA100001", modelId: models.asterLongRange.id, color: "Glacier White",
          purchasedAt: daysAgo(400), softwareVersion: "24.3.1",
          installedOptions: ["Tow Package", "Heat Pump", "Panoramic Roof"],
          telematics: {
            create: [
              { recordedAt: daysAgo(240), type: "DTC", code: "P0C73", severity: "WARN", message: "Battery coolant pump control performance" },
              { recordedAt: daysAgo(130), type: "DTC", code: "P0C73", severity: "WARN", message: "Battery coolant pump control performance" },
              { recordedAt: daysAgo(12), type: "DTC", code: "P0C73", severity: "CRITICAL", message: "Battery coolant pump control performance; propulsion power reduced" },
              { recordedAt: daysAgo(12), type: "BATTERY", severity: "WARN", message: "Battery pack temperature above normal range (°C)", value: 48 },
              { recordedAt: daysAgo(1), type: "ODOMETER", severity: "INFO", message: "Odometer reading (miles)", value: 18420 },
            ],
          },
        },
      },
    },
  });

  // Story 2: open recall matches the symptom. The rep may not think to check recalls.
  const cameraRecall = await prisma.recall.create({
    data: {
      campaignNumber: "MR-24-117", modelId: models.kestrel2023.id,
      title: "Rear camera image may not display",
      description: "A software fault in the rear camera module can cause the backup image to go black intermittently.",
      remedy: "Dealer updates rear camera module software to version 3.2.0 or later. About 30 minutes, no charge.",
    },
  });
  await prisma.customer.create({
    data: {
      email: "marcus.bell@example.com", firstName: "Marcus", lastName: "Bell", phone: "555-0102",
      vehicles: {
        create: {
          vin: "0MRKC15V8PA200002", modelId: models.kestrel2023.id, color: "Granite Gray",
          purchasedAt: daysAgo(700), softwareVersion: "23.9.4",
          installedOptions: ["Trailering Package", "Bed Liner"],
          telematics: {
            create: [
              { recordedAt: daysAgo(20), type: "SOFTWARE", severity: "WARN", message: "Rear camera module restarted unexpectedly" },
              { recordedAt: daysAgo(6), type: "SOFTWARE", severity: "WARN", message: "Rear camera module restarted unexpectedly" },
              { recordedAt: daysAgo(2), type: "ODOMETER", severity: "INFO", message: "Odometer reading (miles)", value: 31877 },
            ],
          },
          recalls: { create: { recallId: cameraRecall.id, status: "OPEN" } },
        },
      },
    },
  });

  // Story 3: healthy new vehicle, first-time caller. The agent must not invent problems.
  await prisma.customer.create({
    data: {
      email: "priya.raman@example.com", firstName: "Priya", lastName: "Raman", phone: "555-0103",
      vehicles: {
        create: {
          vin: "0MRSH25H1TA300003", modelId: models.solace2026.id, color: "Midnight Blue",
          purchasedAt: daysAgo(21), softwareVersion: "26.1.0",
          installedOptions: ["Premium Audio"],
          telematics: {
            create: [
              { recordedAt: daysAgo(1), type: "ODOMETER", severity: "INFO", message: "Odometer reading (miles)", value: 640 },
              { recordedAt: daysAgo(1), type: "BATTERY", severity: "INFO", message: "Hybrid battery state of health (%)", value: 100 },
            ],
          },
        },
      },
    },
  });

  // Story 4: one customer, two vehicles. The agent should ask which vehicle or cover both.
  await prisma.customer.create({
    data: {
      email: "jordan.okafor@example.com", firstName: "Jordan", lastName: "Okafor", phone: "555-0104",
      vehicles: {
        create: [
          {
            vin: "0MRAE4SR2NA400004", modelId: models.asterStandard.id, color: "Ember Red",
            purchasedAt: daysAgo(1100), softwareVersion: "24.1.2",
            installedOptions: [],
            telematics: {
              create: [
                { recordedAt: daysAgo(3), type: "BATTERY", severity: "INFO", message: "Battery state of health (%)", value: 91 },
                { recordedAt: daysAgo(3), type: "ODOMETER", severity: "INFO", message: "Odometer reading (miles)", value: 42210 },
              ],
            },
          },
          {
            vin: "0MRKW15T6MA400005", modelId: models.kestrel2021.id, color: "Summit White",
            purchasedAt: daysAgo(1500), softwareVersion: "22.4.0",
            installedOptions: ["Work Lights"],
            telematics: {
              create: [
                { recordedAt: daysAgo(4), type: "DTC", code: "P0128", severity: "WARN", message: "Coolant temperature below thermostat regulating temperature" },
                { recordedAt: daysAgo(4), type: "ODOMETER", severity: "INFO", message: "Odometer reading (miles)", value: 88934 },
              ],
            },
          },
        ],
      },
    },
  });

  // Story 5: a closed case whose fault came back last week. "What changed since last contact?"
  await prisma.customer.create({
    data: {
      email: "sam.torres@example.com", firstName: "Sam", lastName: "Torres", phone: "555-0105",
      vehicles: {
        create: {
          vin: "0MRSH25H9PA500006", modelId: models.solace2023.id, color: "Sage Green",
          purchasedAt: daysAgo(800), softwareVersion: "25.2.3",
          installedOptions: ["Cold Weather Package"],
          telematics: {
            create: [
              { recordedAt: daysAgo(100), type: "DTC", code: "P0420", severity: "WARN", message: "Catalyst system efficiency below threshold" },
              { recordedAt: daysAgo(6), type: "DTC", code: "P0420", severity: "WARN", message: "Catalyst system efficiency below threshold" },
              { recordedAt: daysAgo(2), type: "ODOMETER", severity: "INFO", message: "Odometer reading (miles)", value: 39102 },
            ],
          },
        },
      },
    },
  });

  await seedCases();
}

async function seedCases() {
  const customer = (email: string) =>
    prisma.customer.findUniqueOrThrow({ where: { email } }).then((c) => c.id);

  // Each visit leaves a note thread. Dana's open case was last contacted 11 days ago and is waiting
  // on the buyback review team; Marcus's case was contacted yesterday.
  const dana = await customer("dana.whitfield@example.com");
  await prisma.case.create({
    data: {
      vin: "0MRAE4LR5RA100001", customerId: dana, status: "CLOSED", category: "Battery & Charging",
      subject: "Warning light, reduced charging speed", openedAt: daysAgo(238), closedAt: daysAgo(230),
      description: "Customer reports a battery warning light and slower DC fast charging.",
      resolution: "Dealer cleared P0C73 and reflashed thermal management software.",
      notes: {
        create: [
          {
            source: "REP", issue: "Battery warning light and slower DC fast charging",
            summary: "Dana reported the battery warning light and slower fast charging. Telematics shows P0C73.",
            nextSteps: ["Book a dealer diagnostic"], createdAt: daysAgo(238),
          },
          {
            source: "REP", issue: "Repair completed",
            summary: "Dealer cleared P0C73 and reflashed the thermal management software. Dana confirmed charging speed is back to normal.",
            nextSteps: ["Close the case"], createdAt: daysAgo(230),
          },
        ],
      },
    },
  });
  await prisma.case.create({
    data: {
      vin: "0MRAE4LR5RA100001", customerId: dana, status: "CLOSED", category: "Battery & Charging",
      subject: "Battery warning light returned", openedAt: daysAgo(128), closedAt: daysAgo(115),
      description: "Same warning as before. Customer frustrated about a second visit.",
      resolution: "Dealer replaced battery coolant pump under warranty.",
      notes: {
        create: [
          {
            source: "AI_DRAFT_EDITED", issue: "Battery warning light returned (P0C73, second time)",
            summary: "Same warning as the first visit. Dana is frustrated about a second dealer visit.",
            nextSteps: ["Book a dealer visit", "Ask the dealer to check the coolant pump, not only the software"],
            createdAt: daysAgo(128),
          },
          {
            source: "REP", issue: "Dealer status check",
            summary: "Dealer is waiting on a replacement coolant pump.",
            nextSteps: ["Call Dana when the part arrives"], createdAt: daysAgo(121),
          },
          {
            source: "REP", issue: "Repair completed",
            summary: "Coolant pump replaced under warranty. Warning cleared.",
            nextSteps: ["Close the case"], createdAt: daysAgo(115),
          },
        ],
      },
    },
  });
  await prisma.case.create({
    data: {
      vin: "0MRAE4LR5RA100001", customerId: dana, status: "OPEN", category: "Battery & Charging",
      subject: "Reduced power warning on highway", openedAt: daysAgo(11),
      description: "Vehicle limited propulsion power on the highway. Customer asking for a buyback.",
      notes: {
        create: [
          {
            source: "REP", issue: "Reduced propulsion power on the highway (P0C73, third occurrence)",
            summary: "Dana is asking for a buyback after two earlier repairs. Request sent to the buyback review team.",
            nextSteps: ["Call Dana with the review team's decision"], createdAt: daysAgo(11),
          },
          // Saved on the wrong case and removed. No read returns it, and the evals check that no
          // answer mentions winter tires. See docs/decisions.md#case-page
          {
            source: "REP", summary: "Asked about winter tire packages and a price quote.",
            createdAt: daysAgo(10), removedAt: daysAgo(10),
          },
        ],
      },
    },
  });

  // The notes never mention the recall: the rep hasn't connected the symptom to it yet.
  const marcus = await customer("marcus.bell@example.com");
  await prisma.case.create({
    data: {
      vin: "0MRKC15V8PA200002", customerId: marcus, status: "OPEN", category: "Electrical",
      subject: "Backup camera goes black", openedAt: daysAgo(5),
      description: "Backup camera screen goes black for a few seconds while reversing, about twice a week.",
      notes: {
        create: [
          {
            source: "AI_DRAFT_EDITED", issue: "Backup camera screen goes black while reversing",
            summary: "Happens about twice a week for a few seconds. Advised restarting the infotainment system as a workaround.",
            nextSteps: ["Follow up if it keeps happening"], createdAt: daysAgo(5),
          },
          {
            source: "REP", issue: "Follow-up call",
            summary: "The camera went black again twice this week. Restarting the infotainment system didn't help.",
            nextSteps: ["Book a dealer visit"], createdAt: daysAgo(1),
          },
        ],
      },
    },
  });

  const jordan = await customer("jordan.okafor@example.com");
  await prisma.case.create({
    data: {
      vin: "0MRAE4SR2NA400004", customerId: jordan, status: "CLOSED", category: "Charging",
      subject: "Home charger setup question", openedAt: daysAgo(300), closedAt: daysAgo(300),
      description: "Customer asked how to schedule off-peak charging.",
      resolution: "Walked customer through scheduled charging in the app.",
    },
  });

  const sam = await customer("sam.torres@example.com");
  await prisma.case.create({
    data: {
      vin: "0MRSH25H9PA500006", customerId: sam, status: "CLOSED", category: "Engine & Emissions",
      subject: "Check engine light", openedAt: daysAgo(98), closedAt: daysAgo(90),
      description: "Check engine light on. Telematics showed P0420.",
      resolution: "Dealer replaced downstream oxygen sensor. Code cleared.",
      notes: {
        create: {
          source: "REP", issue: "Check engine light (P0420)",
          summary: "Customer called about a check engine light. Booked a dealer diagnostic.",
          nextSteps: ["Dealer diagnostic appointment booked", "Follow up after repair"],
          createdAt: daysAgo(98),
        },
      },
    },
  });
}

main()
  .then(() => console.log("Seeded 5 customers, 6 vehicles."))
  .finally(() => prisma.$disconnect());
