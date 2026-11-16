// Synthetic call transcripts for the call-summary evals, keyed by VIN. They match the seeded data.
export const cannedTranscripts: Record<string, { label: string; text: string }> = {
  "0MRKC15V8PA200002": {
    label: "Marcus: backup camera keeps going black",
    text: `Rep: Thanks for calling Meridian support, this is Alex. How can I help?
Customer: Hi, it's Marcus Bell. My Kestrel's backup camera keeps cutting out. I'm reversing and the screen just goes black for a few seconds.
Rep: That sounds frustrating. How often is it happening?
Customer: Maybe twice a week. Last Tuesday I almost backed into my neighbor's mailbox. It comes back on its own, but it's scary with the trailer hooked up.
Rep: Understood. Has anything else acted up, like the radio or other screens?
Customer: No, just the camera. I already called once last week and nobody got back to me.
Rep: I'm sorry about that. Let me take a look at your truck's record and see what's going on.
Customer: Okay. I just want it fixed, and I don't want to pay for it if it's a known problem.`,
  },
  "0MRAE4LR5RA100001": {
    label: "Dana: reduced power again, asking for a buyback",
    text: `Rep: Meridian support, this is Jordan. How can I help today?
Customer: This is Dana Whitfield. My Aster lost power on the highway again. The dash said reduced propulsion power and I had to limp to an exit doing forty.
Rep: I'm really sorry. Are you safe right now?
Customer: I'm home, but I'm done. This is the third time with the same battery warning. They reflashed it, then they replaced a pump, and now it's worse.
Rep: I can hear how frustrating this has been.
Customer: I want a buyback. I'm not driving my kids around in a car that shuts down on the freeway.
Rep: Your safety comes first. Let me pull up the history so I can get this to the right team.
Customer: Please don't just send me to the dealer again. That hasn't worked twice.`,
  },
  "0MRSH25H9PA500006": {
    label: "Sam: check engine light is back",
    text: `Rep: Thanks for calling Meridian, this is Priya. What's going on?
Customer: Hi, Sam Torres. The check engine light is back on my Solace. It was fixed in the summer, I thought.
Rep: Okay, when did it come back on?
Customer: About a week ago. The car drives fine, no weird noises, but I don't want to ignore it.
Rep: Good call. Do you remember what was done last time?
Customer: They replaced some sensor. An oxygen sensor I think. Is that covered again if it's the same thing?
Rep: Let me check your vehicle's record and the last repair.
Customer: Thanks. I'd prefer a Saturday appointment if I need to bring it in.`,
  },
};
