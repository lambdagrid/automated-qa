## Automated QA _(by LambdaGrid)_

_A breathtakingly simple way to write QA Checks and keep running them_


### Documentation

This project allows you to write simple high-level QA checks in JavaScript
using a dead-simple API. With that done "Automated QA" will be able to
run those QA Checks for you on demand or on a schedule making sure to notify
you when a check fails so that you can get that bug fixed before customers
even notice.

Writing QA Checks in the `qa-checklist` folder looks a bit like this:

```js
import { client } from "my-todo-api-client";
import { flow, act, check } from "../sdk";

flow("todo api", () => {
  act("list todos", () => client.todos());
  check("no todos exist");

  act("create 1st todo", () => client.new({text: "#1"}));
  check("1st todo was created");
  act("list todos", () => client.todos());
  check("1 todo exists with done=false");

  act("delete todo", (todos) => client.delete(todos[0].id));
  check("1st todo was deleted");
  act("list todos", () => client.todos());
  check("no todos left");
});
```

**flow(name: string, fn: () => void): void**

`flow` defines a new flow which is used to group related checks. Often
named after a specific feature, page or functionality. The `fn` parameter
will be called immediatly and any `act` or `check` called within it will
be added to this flow.

**act(name: string, fn: (previousResult: any) => any): void**

`act` defines a new act step. It get's passed the result of the previous
act or check step and it's `fn` is expected to generate an action returning
some result to be used either by the following `act` step or compared to
a "snapshot" by a `check` step.

**check(name: string, transformFn?: (result: any) => any): void**

`check` defines a new check step. It will make sure to take the result of the
previous `act` step and compare it to the snapshotted result from the
previous run marking this "check" as failed in the case the don't match.

Here the `transformFn` parameter is optional and allows you to transform the
result from the previous `act` step before it's compared to it's snapshot.
This is useful when you need to strip non-deterministic data like unique `id`s.


### Deploying

TBD


### Running Tests

A simple integration test suite can be found in the `test/` folder.

To run it start by starting up the _dev_ server for the `test-service` and
the automated QA "worker" server using:

```
$ cd worker
$ npm run dev
```

and

```
$ cd test-service
$ npm run dev
```

_(Make sure you've followed the instructions to setup the `test-service`'s
database & dependencies beforehand)_

**Testing**

Now with both of those servers running on port `3000` and `3001` you should
be able to run:

```
$ npm test
```

### Running Linters

This project includes a `.prettierrc` file for your editor to use.

This project also has a TSLint configured which you can have your editor run
for you.

If you wish to run the lint checks from the command line you can use: `npm run lint`.

### License

GPL-3.0. See `LICENSE.txt` file.
