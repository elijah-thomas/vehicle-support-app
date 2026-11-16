// The test database. Only one whose name ends in _test is ever used, because the seed deletes
// every row first: a typo must never point the tests at a dev or deployed database.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://vehicle:vehicle@localhost:5440/vehicle_support_test?schema=public";

const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
if (!name.endsWith("_test")) {
  throw new Error(`Refusing to run tests against database "${name}": its name must end in _test`);
}
