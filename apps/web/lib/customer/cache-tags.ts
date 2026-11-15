// Every cache tag in the app, in one place, so reads and invalidations can't drift apart.
export const cacheTags = {
  vehicle: (vin: string) => `vehicle:${vin}`,
  cases: (vin: string) => `cases:${vin}`,
};
