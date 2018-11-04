const { flow, act, check } = require('../sdk');
const request = require('request-promise-native');

const request.defaults({
  transform: body => JSON.parse(body),
});

const url = (path, key) => {
  const root = process.env.TARGET_ROOT;
  if (key) {
    return `https://${key}@${root}${path}`;
  } else {
    return `https://${root}${path}`;
  }
}

const intentional404 = () => request(url('/asdf'));
const intentional401 = () => request(url('/todos'));

let apiKey = '';
const getApiKey = () => request({
  uri: url('/api-keys'),
  method: 'POST',
}).then(res => {
  apiKey = res.data.api_key;
});

const getListOfTodos = () => request(url('/todos', apiKey));

const invalidTodoCreation = () => request({
  uri: url('/todos', apiKey),
  method: 'POST',
  body: {
    this_payload_format_is: 'wrong',
  },
  json: true,
});

const validTodoCreation1 = () => request({
  uri: url('/todos', apiKey),
  method: 'POST',
  body: {
    text: "brush teeth",
  },
  json: true,
});

const stripIdFromItem = res => {
  delete res.data.todo.id;
  return res;
};

const stripIdFromList = res => {
  res.data.todos.forEach(item => delete item.id);
  return res;
};

const validTodoCreation2 = () => request({
  uri: url('/todos', apiKey),
  method: 'POST',
  body: {
    text: "wash face",
  },
  json: true,
});

let id1 = null, id2 = null;
const copyIds = todosRes => {
  id1 = todosRes.data.todos[0].id;
  id2 = todosRes.data.todos[1].id;
  return todosRes;
};

const todoChange1 = () => request({
  uri: url(`/todos/${id1}`, apiKey),
  method: 'PUT',
  body: {
    done: true,
  },
  json: true,
});

const todoChange2 = () => request({
  uri: url(`/todos/${id2}`, apiKey),
  method: 'PUT',
  body: {
    text: "wash face gently"
  },
  json: true,
});

let apiKey2 = '';
const get2ndApiKey = () => request({
  uri: url('/api-keys'),
  method: 'POST',
}).then(res => {
  apiKey2 = res.data.api_key;
});

const getSecondList = () => request(url('/todos', apiKey2));

flow("Basic API functionality", done => {

  act("ping API endpoints that don't exist", intentional404)
  .then(check("returns 404 not found"))

  .then(act("ping URL requiring authentication", intentional401))
  .then(check("returns 401 not authorized"))

  .then(act("get an API key", getApiKey))

  .then(getListOfTodos)
  .then(check("list should be empty"))

  .then(act("submit some invalid todos", invalidTodoCreation))
  .then(check("invalid todos should return 4xx"))

  .then(act("submit a valid todo", validTodoCreation1))
  .then(check("returns a 201", stripIdFromItem))

  .then(getListOfTodos)
  .then(check("list should have one todo", stripIdFromList))

  .then(act("submit a second todo", validTodoCreation2))
  .then(getListOfTodos)
  .then(act("copy down the ids of the todos", copyIds))
  .then(check("list should have two items", stripIdFromList))

  .then(act("mark first todo as 'done'", todoChange1))
  .then(getListOfTodos)
  .then(check("first todo should be done", stripIdFromList))

  .then(act("change text of second todo", todoChange2))
  .then(getListOfTodos)
  .then(check("second todo has new text", stripIdFromList))

  .then(act("get a second API key", get2ndApiKey))
  .then(act("get list of todos for second API key", getSecondList))
  .then(check("second list should be empty"))

  .then(act("delete a todo", () => request({
    uri: url(`/todos/${id1}`),
    method: 'DELETE',
  })))
  .then(getListOfTodos)
  .then(check("first todo is deleted", stripIdFromList))

  .then(act("delete second todo", () => request({
    uri: url(`/todos/${id2}`),
    method: 'DELETE',
  })))
  .then(getListOfTodos)
  .then(check("second todo is deleted", stripIdFromList))

  .then(act("delete second API key", () => request.del(url('/api-keys', apiKey2))))
  .then(act("test second API key", () => request(url('/todos', apiKey2))))
  .then(check("second key should be invalid"))

  .then(act("delete first API key", () => request.del(url('/api-keys', apiKey))))
  .then(act("test first API key", getListOfTodos)
  .then(check("first key should be invalid"));

});
