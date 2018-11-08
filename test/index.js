const assert = require("assert");
const request = require("request-promise-native");

const url = (path) => `${process.env.ROOT}${path}`;

const json404 = JSON.stringify({
  error: {
    code: 4002,
    message: "Requested resource not found",
    cause: "The request's URI points to a resource which does not exist.",
  },
});

const json401 = JSON.stringify({
  error: {
    code: 4000,
    message: "Missing or invalid API key.",
    cause: "The API key is either missing, is no longer active, or malformed.",
  },
});

const json400 = JSON.stringify({
  error: {
    code: 4001,
    message: "Missing or invalid request payload.",
    cause: "The request's payload is either missing or malformed.",
  },
});

const noTodos = JSON.stringify({
  data: {
    todos: [],
  },
});

const firstTodoCreate = JSON.stringify({
  data: {
    todo: {
      text: "brush teeth",
      done: false,
    },
  },
});

const afterFirstTodoCreate = JSON.stringify({
  data: {
    todos: [
      {
        text: "brush teeth",
        done: false,
      },
    ],
  },
});

const afterSecondTodoCreate = JSON.stringify({
  data: {
    todos: [
      {
        text: "brush teeth",
        done: false,
      },
      {
        text: "wash face",
        done: false,
      },
    ],
  },
});

const afterFirstTodoUpdate = JSON.stringify({
  data: {
    todos: [
      {
        text: "brush teeth",
        done: true,
      },
      {
        text: "wash face",
        done: false,
      },
    ],
  },
});

const afterSecondTodoUpdate = JSON.stringify({
  data: {
    todos: [
      {
        text: "brush teeth",
        done: true,
      },
      {
        text: "wash face gently",
        done: false,
      },
    ],
  },
});

const afterFirstTodoDelete = JSON.stringify({
  data: {
    todos: [
      {
        text: "wash face gently",
        done: false,
      },
    ],
  },
});

const payload1 = {
  flows: [
    {
      name: "Basic API functionality",
      assertions: [
        {
          name: "returns 404 not found",
          snapshot: json404,
        },
        {
          name: "returns 401 not authorized",
          snapshot: json401,
        },
        {
          name: "list should be empty",
          snapshot: noTodos,
        },
        {
          name: "invalid todos should return 4xx",
          snapshot: json400,
        },
        {
          name: "returns a 201",
          snapshot: firstTodoCreate,
        },
        {
          name: "list should have one todo",
          snapshot: afterFirstTodoCreate,
        },
        {
          name: "list should have two items",
          snapshot: afterSecondTodoCreate,
        },
        {
          name: "first todo should be done",
          snapshot: afterFirstTodoUpdate,
        },
        {
          name: "second todo has new text",
          snapshot: afterSecondTodoUpdate,
        },
        {
          name: "second list should be empty",
          snapshot: noTodos,
        },
        {
          name: "first todo is deleted",
          snapshot: afterFirstTodoDelete,
        },
        {
          name: "second todo is deleted",
          snapshot: noTodos,
        },
        {
          name: "second key should be invalid",
          snapshot: json401,
        },
        {
          name: "first key should be invalid",
          snapshot: json401,
        },
      ],
    },
  ],
};

const desired1 = {
  flows: [
    {
      name: "Basic API functionality",
      assertions: [
        {
          name: "returns 404 not found",
          result: "MATCH",
        },
        {
          name: "returns 401 not authorized",
          result: "MATCH",
        },
        {
          name: "list should be empty",
          result: "MATCH",
        },
        {
          name: "invalid todos should return 4xx",
          result: "MATCH",
        },
        {
          name: "returns a 201",
          result: "MATCH",
        },
        {
          name: "list should have one todo",
          result: "MATCH",
        },
        {
          name: "list should have two items",
          result: "MATCH",
        },
        {
          name: "first todo should be done",
          result: "MATCH",
        },
        {
          name: "second todo has new text",
          result: "MATCH",
        },
        {
          name: "second list should be empty",
          result: "MATCH",
        },
        {
          name: "first todo is deleted",
          result: "MATCH",
        },
        {
          name: "second todo is deleted",
          result: "MATCH",
        },
        {
          name: "second key should be invalid",
          result: "MATCH",
        },
        {
          name: "first key should be invalid",
          result: "MATCH",
        },
      ],
    },
  ],
};

const payload2 = {
  flows: [
    {
      name: "Basic API functionality",
      assertions: [
        {
          name: "returns 404 not found",
        },
        {
          name: "returns 401 not authorized",
        },
        {
          name: "list should be empty",
        },
        {
          name: "invalid todos should return 4xx",
        },
        {
          name: "returns a 201",
        },
        {
          name: "list should have one todo",
        },
        {
          name: "list should have two items",
        },
        {
          name: "first todo should be done",
        },
        {
          name: "second todo has new text",
        },
        {
          name: "second list should be empty",
        },
        {
          name: "first todo is deleted",
        },
        {
          name: "second todo is deleted",
        },
        {
          name: "second key should be invalid",
        },
        {
          name: "first key should be invalid",
        },
      ],
    },
  ],
};

const desired2 = {
  flows: [
    {
      name: "Basic API functionality",
      assertions: [
        {
          name: "returns 404 not found",
          result: "NEW",
        },
        {
          name: "returns 401 not authorized",
          result: "NEW",
        },
        {
          name: "list should be empty",
          result: "NEW",
        },
        {
          name: "invalid todos should return 4xx",
          result: "NEW",
        },
        {
          name: "returns a 201",
          result: "NEW",
        },
        {
          name: "list should have one todo",
          result: "NEW",
        },
        {
          name: "list should have two items",
          result: "NEW",
        },
        {
          name: "first todo should be done",
          result: "NEW",
        },
        {
          name: "second todo has new text",
          result: "NEW",
        },
        {
          name: "second list should be empty",
          result: "NEW",
        },
        {
          name: "first todo is deleted",
          result: "NEW",
        },
        {
          name: "second todo is deleted",
          result: "NEW",
        },
        {
          name: "second key should be invalid",
          result: "NEW",
        },
        {
          name: "first key should be invalid",
          result: "NEW",
        },
      ],
    },
  ],
};

const payload3 = {
  flows: [
    {
      name: "Basic API functionality",
      assertions: [
        {
          name: "returns 404 not found",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "returns 401 not authorized",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "list should be empty",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "invalid todos should return 4xx",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "returns a 201",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "list should have one todo",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "list should have two items",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "first todo should be done",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "second todo has new text",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "second list should be empty",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "first todo is deleted",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "second todo is deleted",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "second key should be invalid",
          snapshot: "intentionally bad snapshot",
        },
        {
          name: "first key should be invalid",
          snapshot: "intentionally bad snapshot",
        },
      ],
    },
  ],
};

const desired3 = {
  flows: [
    {
      name: "Basic API functionality",
      assertions: [
        {
          name: "returns 404 not found",
          result: "MISS",
        },
        {
          name: "returns 401 not authorized",
          result: "MISS",
        },
        {
          name: "list should be empty",
          result: "MISS",
        },
        {
          name: "invalid todos should return 4xx",
          result: "MISS",
        },
        {
          name: "returns a 201",
          result: "MISS",
        },
        {
          name: "list should have one todo",
          result: "MISS",
        },
        {
          name: "list should have two items",
          result: "MISS",
        },
        {
          name: "first todo should be done",
          result: "MISS",
        },
        {
          name: "second todo has new text",
          result: "MISS",
        },
        {
          name: "second list should be empty",
          result: "MISS",
        },
        {
          name: "first todo is deleted",
          result: "MISS",
        },
        {
          name: "second todo is deleted",
          result: "MISS",
        },
        {
          name: "second key should be invalid",
          result: "MISS",
        },
        {
          name: "first key should be invalid",
          result: "MISS",
        },
      ],
    },
  ],
};

async function runTests() {
  const observed1 = await request.post({
    uri: url("/v0/run"),
    body: payload1,
    json: true,
  });
  assert.deepEqual(observed1, desired1);
  console.log("payload 1 passed");

  const observed2 = await request.post({
    uri: url("/v0/run"),
    body: payload2,
    json: true,
  });
  assert.deepEqual(observed2, desired2);
  console.log("payload 2 passed");

  const observed3 = await request.post({
    uri: url("/v0/run"),
    body: payload3,
    json: true,
  });
  assert.deepEqual(observed3, desired3);
  console.log("payload 3 passed");
}

runTests();
