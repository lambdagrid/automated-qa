const { flow, act, check } = require("../dist");
let request = require("request-promise-native");

request = request.defaults({
  simple: false,
  json: true,
});

const url = (path, key) => {
  const root = process.env.TARGET_ROOT || "localhost:3001";
  if (key) {
    return `http://${key}@${root}${path}`;
  } else {
    return `http://${root}${path}`;
  }
};

const intentional404 = () => request(url("/asdf"));
const intentional401 = () => request(url("/todos"));

let apiKey = "";
const getApiKey = () =>
  request.post(url("/api-keys")).then((res) => {
    apiKey = res.data.api_key;
  });

const getListOfTodos = () => request(url("/todos", apiKey));

const invalidTodoCreation = () =>
  request.post({
    uri: url("/todos", apiKey),
    body: {
      this_payload_format_is: "wrong",
    },
    json: true,
  });

const validTodoCreation1 = () =>
  request.post({
    uri: url("/todos", apiKey),
    body: {
      text: "brush teeth",
    },
    json: true,
  });

const stripIdFromItem = (res) => {
  delete res.data.todo.id;
  return res;
};

const stripIdFromList = (res) => {
  res.data.todos.forEach((item) => delete item.id);
  return res;
};

const validTodoCreation2 = () =>
  request.post({
    uri: url("/todos", apiKey),
    body: {
      text: "wash face",
    },
    json: true,
  });

let id1 = null,
  id2 = null;
const copyIds = (todosRes) => {
  id1 = todosRes.data.todos[0].id;
  id2 = todosRes.data.todos[1].id;
  return todosRes;
};

const todoChange1 = () =>
  request.put({
    uri: url(`/todos/${id1}`, apiKey),
    body: { done: true },
  });

const todoChange2 = () =>
  request.put({
    uri: url(`/todos/${id2}`, apiKey),
    body: { text: "wash face gently" },
  });

let apiKey2 = "";
const get2ndApiKey = () =>
  request.post(url("/api-keys")).then((res) => {
    apiKey2 = res.data.api_key;
  });

flow("Basic API functionality", () => {
  act("ping API endpoints that don't exist", intentional404);
  check("returns 404 not found");

  act("ping URL requiring authentication", intentional401);
  check("returns 401 not authorized");

  act("get an API key", getApiKey);

  act("fetch todos", getListOfTodos);
  check("list should be empty");

  act("submit some invalid todos", invalidTodoCreation);
  check("invalid todos should return 4xx");

  act("submit a valid todo", validTodoCreation1);
  check("returns a 201", stripIdFromItem);

  act("fetch todos", getListOfTodos);
  check("list should have one todo", stripIdFromList);

  act("submit a second todo", validTodoCreation2);
  act("fetch todos", getListOfTodos);
  act("copy down the ids of the todos", copyIds);
  check("list should have two items", stripIdFromList);

  act("mark first todo as 'done'", todoChange1);
  act("fetch todos", getListOfTodos);
  check("first todo should be done", stripIdFromList);

  act("change text of second todo", todoChange2);
  act("fetch todos", getListOfTodos);
  check("second todo has new text", stripIdFromList);

  act("get a second API key", get2ndApiKey);
  act("get todos for second API key", () => request(url("/todos", apiKey2)));
  check("second list should be empty");

  act("delete a todo", () => request.del(url(`/todos/${id1}`, apiKey)));
  act("fetch todos", getListOfTodos);
  check("first todo is deleted", stripIdFromList);

  act("delete second todo", () => request.delete(url(`/todos/${id2}`, apiKey)));
  act("fetch todos", getListOfTodos);
  check("second todo is deleted", stripIdFromList);

  act("delete second API key", () => request.del(url("/api-keys", apiKey2)));
  act("test second API key", () => request(url("/todos", apiKey2)));
  check("second key should be invalid");

  act("delete first API key", () => request.del(url("/api-keys", apiKey)));
  act("test first API key", getListOfTodos);
  check("first key should be invalid");
});
