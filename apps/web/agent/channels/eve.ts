import type { AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { VIN_PATTERN } from "@/lib/format";

// Decision (D28): advisors don't sign in (out of scope), so the only claim is the vehicle the page
// has open, sent in a header as /api/agent receives it in the body. A request without a valid VIN
// gets a 401. See docs/decisions.md#eve-assistant
const vehiclePage: AuthFn<Request> = async (request) => {
  const vin = request.headers.get("x-vehicle-vin")?.toUpperCase();
  if (!vin || !VIN_PATTERN.test(vin)) return null;
  return { authenticator: "vehicle-page", principalType: "user", principalId: "advisor", attributes: { vin } };
};

export default eveChannel({ auth: [vehiclePage] });
