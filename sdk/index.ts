import { deepEqual } from "assert";
import { List, Map, Record } from "immutable";

enum AssertionResult {
  Unknown = "UNKNOWN",
  New = "NEW",
  Match = "MATCH",
  Miss = "MISS",
}

interface IAssertionParams {
  name?: string;
  result?: AssertionResult;
  value?: string;
  snapshot?: string;
}
export class Assertion extends Record({ name: "", result: AssertionResult.Unknown, snapshot: "", value: "" }) {
  public name: string;
  public result: AssertionResult;
  public value: string;
  public snapshot: string;

  constructor(params?: IAssertionParams) {
    super(params);
  }

  public with(values: IAssertionParams) {
    return this.merge(values) as this;
  }
}

interface IFlowParams {
  name?: string;
  assertions?: Map<string, Assertion>;
}
export class Flow extends Record({ name: "", assertions: Map<string, Assertion>() }) {
  public name: string;
  public assertions: Map<string, Assertion>;

  constructor(params?: IFlowParams) {
    super(params);
  }

  public with(values: IFlowParams) {
    return this.merge(values) as this;
  }
}

let FLOWS = Map<string, Flow>();
let FLOW_FNS = Map<string, List<(data: any) => any>>();
let currentFlow: Flow = null;

export function flow(name: string, fn: () => () => void) {
  if (currentFlow) {
    throw new Error("You can't nest flows. Do now call `flow` within an other `flow` definition.");
  }

  // Setup globals
  currentFlow = new Flow({name});
  FLOWS = FLOWS.set(name, currentFlow);
  FLOW_FNS = FLOW_FNS.set(name, List<(data: any) => any>());

  // Call callback wich in turn will be calling act and check
  fn();

  // Clear globals so the `flow` can be called again
  currentFlow = null;
}

export function act(name: string, fn: (data: any) => Promise<any>) {
  if (!currentFlow) {
    throw new Error("You can't call `act` outside of a flow.");
  }
  const flowName = currentFlow.name;
  FLOW_FNS = FLOW_FNS.set(flowName, FLOW_FNS.get(flowName).push((data: any) => {
    /* tslint:disable-next-line:no-console */
    console.log("  ACT: " + name);
    return Promise.resolve().then(() => fn(data));
  }));
}

export function check(name: string, fn: (data: any) => Promise<any>) {
  if (!currentFlow) {
    throw new Error("You can't call `check` outside of a flow.");
  }
  const flowName = currentFlow.name;
  FLOW_FNS = FLOW_FNS.set(flowName, FLOW_FNS.get(flowName).push((data: any) => {
    /* tslint:disable-next-line:no-console */
    console.log("CHECK: " + name);
    return Promise.resolve().then(() => fn ? fn(data) : data).then((value) => {
      const f = FLOWS.get(flowName);
      FLOWS.set(flowName, f.with({
        assertions: f.assertions.set(name, new Assertion({ name, value })),
      }));
    });
  }));
}

export async function run(flows: Map<string, Flow>) {
  const flowNames = FLOWS.keys();
  for (const flowName of flowNames) {
    /* tslint:disable-next-line:no-console */
    console.log(" FLOW: " + flowName);
    const fns = FLOW_FNS.get(flowName);
    let result = null;
    for (const fn of fns) {
      result = await fn(result);
    }
    console.log(FLOWS.toJS());
  }
}
