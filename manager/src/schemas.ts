export const V1SnapshotsUpdatePayload = {
  definitions: {
    flow: {
      properties: {
        name: { type: "string" },
        snapshots: {
          items: { $ref: "#/definitions/snapshot" },
          type: "array",
        },
      },
      required: ["name", "snapshots"],
      type: "object",
    },
    snapshot: {
      properties: {
        name: { type: "string" },
        value: { type: "string" },
      },
      required: ["name", "value"],
      type: "object",
    },
  },
  properties: {
    flows: {
      items: { $ref: "#/definitions/flow" },
      type: "array",
    },
  },
  required: ["flows"],
  type: "object",
};
