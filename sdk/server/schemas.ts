export const V0RunPayloadSchema = {
  definitions: {
    assertion: {
      properties: {
        name: { type: "string", minLength: 1 },
        snapshot: { type: "string" },
      },
      required: ["name"],
      type: "object",
    },
    flow: {
      properties: {
        assertions: {
          items: { $ref: "#/definitions/assertion" },
          minItems: 1,
          type: "array",
        },
        name: { type: "string", minLength: 1 },
      },
      required: ["name", "assertions"],
      type: "object",
    },
  },
  properties: {
    flows: {
      items: { $ref: "#/definitions/flow" },
      minItems: 1,
      type: "array",
    },
  },
  required: ["flows"],
  type: "object",
};
