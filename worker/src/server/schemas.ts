export const V0RunPayloadSchema = {
  definitions: {
    assertion: {
      properties: {
        name: { type: "string" },
        snapshot: { type: "string" },
      },
      required: ["name"],
      type: "object",
    },
    flow: {
      properties: {
        assertions: {
          items: { $ref: "#/definitions/assertion" },
          type: "array",
        },
        name: { type: "string" },
      },
      required: ["name", "assertions"],
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
