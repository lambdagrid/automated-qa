import * as Ajv from "ajv";
import * as bodyParser from "body-parser";
import * as express from "express";
import { List, Map } from "immutable";
import { Assertion, Flow, run } from "../index";
import { V0RunPayloadSchema } from "./schemas";

export class Application {
  public static Errors = {
    BadRequest: {
      cause: "The request's payload is either missing or malformed.",
      code: 4001,
      message: "Missing or invalid request payload.",
    },
    NotFound: {
      cause: "The request's URI points to a resource which does not exist.",
      code: 4002,
      message: "Requested resource not found",
    },
  };

  public config: Map<string, string>;
  public httpServer: express.Application;
  public router: express.Router;

  public setupConfig() {
    this.config = Map<string, string>();
    this.config = this.config.set("env", process.env.NODE_ENV || "development");
    this.config = this.config.set("port", process.env.PORT || "3000");
  }

  public setupRoutes() {
    const r = (this.router = express.Router());
    this.httpServer = express();
    this.httpServer.use(bodyParser.json());
    this.httpServer.use("/", this.router);

    r.use(middlewareLog.bind(null, this));

    r.get("/", handleIndex.bind(null, this));
    r.post("/v0/run", handleV0Run.bind(null, this));

    r.use(handleNotFound.bind(null, this));
  }

  public setup() {
    this.setupConfig();
    this.setupRoutes();
  }

  public async start() {
    this.setup();

    const port = this.config.get("port");
    this.httpServer.listen(port, (err: Error) => {
      if (err) {
        // tslint:disable-next-line:no-console
        return console.log(err);
      }
      // tslint:disable-next-line:no-console
      console.log(`server is listening on ${port}`);
    });
  }
}

function middlewareLog(app: Application, req: express.Request, res: express.Response, next: () => void) {
  if (app.config.get("env") !== "test") {
    // tslint:disable-next-line:no-console
    console.log("%s %s", req.method, req.url);
  }
  next();
}

function handleIndex(app: Application, req: express.Request, res: express.Response) {
  res.json({});
}

function handleNotFound(app: Application, req: express.Request, res: express.Response) {
  res.status(404).json({ error: Application.Errors.NotFound });
}

interface IV0RunPayloadAssertion {
  name: string;
  snapshot?: string;
}
interface IV0RunPayloadFlow {
  name: string;
  assertions: IV0RunPayloadAssertion[];
}
interface IV0RunPayload {
  flows: IV0RunPayloadFlow[];
}

function validateV0RunPayload(payload: object): [Map<string, Flow>, boolean] {
  let flows = Map<string, Flow>();
  const isValid = new Ajv().validate(V0RunPayloadSchema, payload);
  if (!isValid) {
    return [flows, false];
  }

  for (const payloadFlow of (payload as IV0RunPayload).flows) {
    let assertions = Map<string, Assertion>();
    payloadFlow.assertions.forEach((a) => {
      assertions = assertions.set(a.name, new Assertion(a));
    });
    const flow = new Flow({ name: payloadFlow.name, assertions });
    flows = flows.set(flow.name, flow);
  }

  return [flows, true];
}

function handleV0Run(app: Application, req: express.Request, res: express.Response) {
  const [flows, isValid] = validateV0RunPayload(req.body);
  if (!isValid) {
    res.status(400).json({ error: Application.Errors.BadRequest });
    return;
  }

  res.json({flows: run(flows)});
}

export default new Application();
