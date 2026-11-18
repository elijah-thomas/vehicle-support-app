import type { AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { VIN_PATTERN } from "@/lib/format";

// Spike: no rep login (out of scope), so the caller is anonymous and the only claim is the open
// vehicle, sent by the page in a header, as /api/agent receives it in the body today.
const vehicleCaller: AuthFn<Request> = async (request) => {
  const vin = request.headers.get("x-vehicle-vin")?.toUpperCase();
  if (!vin || !VIN_PATTERN.test(vin)) return null;
  return {
    authenticator: "vehicle-page",
    principalType: "user",
    principalId: "anonymous-advisor",
    attributes: { vin },
  };
};

export default eveChannel({ auth: [vehicleCaller] });
