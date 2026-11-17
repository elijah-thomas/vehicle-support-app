import { expect, test } from "vitest";
import { nextTrail, vehicleView, viewLabel } from "./vehicle-paths";

const VIN = "0MRAE4LR5RA100001";
const overview = `/vehicles/${VIN}`;
const caseA = `${overview}/cases/24117`;
const caseB = `${overview}/cases/23880`;

test("names each vehicle view", () => {
  expect(viewLabel(vehicleView(overview, VIN))).toBe("Telematics and cases");
  expect(viewLabel(vehicleView(caseA, VIN))).toBe("CS-24117");
  expect(viewLabel(vehicleView(`${overview}/cases/new`, VIN))).toBe("New case");
  expect(vehicleView(`/vehicles/OTHER/cases/1`, VIN).kind).toBe("other");
});

test("a page opened directly starts at the overview", () => {
  expect(nextTrail([], caseA, overview)).toEqual([overview, caseA]);
  expect(nextTrail([], overview, overview)).toEqual([overview]);
});

test("each new page is a step, and going back drops the steps after it", () => {
  const forward = nextTrail(nextTrail([overview], caseA, overview), caseB, overview);
  expect(forward).toEqual([overview, caseA, caseB]);
  expect(nextTrail(forward, caseA, overview)).toEqual([overview, caseA]);
  expect(nextTrail(forward, overview, overview)).toEqual([overview]);
});

test("the new-case form is replaced by the page after it", () => {
  const form = nextTrail([overview], `${overview}/cases/new`, overview);
  expect(form).toEqual([overview, `${overview}/cases/new`]);
  expect(nextTrail(form, caseA, overview)).toEqual([overview, caseA]);
  expect(nextTrail(form, overview, overview)).toEqual([overview]);
});
