## Automated QA _(by LambdaGrid)_

_A breathtakingly simple way to write QA Checks and keep running them_


### Description

This project allows you to write simple high-level QA checks in JavaScript
using a dead-simple API. With that done "Automated QA" will be able to
run those QA Checks for you on demand or on a schedule making sure to notify
you when a check fails so that you can get that bug fixed before customers
even notice.

Writing QA Checks using the SDK looks a bit like this:

```js
import { client } from "my-todo-api-client";
import { flow, act, check, start } from "automated-qa-sdk";

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

start();
```

In here, every time the `check` method is called a snapshot of the previous
`act` result will be taken and compared to previous runs to ensure the API
you are testing didn't change/regress.

Once you've written a QA checklist in this format, simply deploy it so that
it's accessible (withing your own app, Heroky, Now.sh or some other hosting
provider) then configure the Automated QA manager to run your checklist on
a set schedule.

### License

GPL-3.0. See `LICENSE.txt` file.
