import { deepEqual } from "assert";
import { List, Map, Record } from "immutable";

enum AssertionResult {
  Unknown = "UNKNOWN",
  New = "NEW",
  Match = "MATCH",
  Miss = "MISS",
}

interface IAssertionParams {
  id?: number;
  name?: string;
  result?: AssertionResult;
  value?: string;
  snapshot?: string;
}
export class Assertion extends Record({ id: 0, name: "", result: AssertionResult.Unknown, snapshot: "", value: "" }) {
  public id: number;
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
  id?: number;
  name?: string;
  assertions?: List<Assertion>;
}
export class Flow extends Record({ id: 0, name: "", assertions: List<Assertion>() }) {
  public id: number;
  public name: string;
  public assertions: List<Assertion>;

  constructor(params?: IFlowParams) {
    super(params);
  }

  public with(values: IFlowParams) {
    return this.merge(values) as this;
  }
}

let FLOWS = List<Flow>();
let FLOW_FNS = List<List<(data: any) => any>>();
let currentFlow: Flow = null;

export function flow(name: string, fn: () => () => void) {
  if (currentFlow) {
    throw new Error("You can't nest flows. Do now call `flow` within an other `flow` definition.");
  }

  // Setup globals
  currentFlow = new Flow({id: FLOWS.size, name});
  FLOWS = FLOWS.push(currentFlow);
  FLOW_FNS = FLOW_FNS.push(List<(data: any) => any>());

  // Call callback wich in turn will be calling act and check
  fn();

  // Clear globals so the `flow` can be called again
  currentFlow = null;
}

export function act(name: string, fn: (data: any) => Promise<any>) {
  if (!currentFlow) {
    throw new Error("You can't call `act` outside of a flow.");
  }
  FLOW_FNS = FLOW_FNS.update(currentFlow.id, (fns) => fns.push((data: any) => {
    /* tslint:disable-next-line:no-console */
    console.log("  ACT: " + name);
    return Promise.resolve().then(() => fn(data));
  }));
}

export function check(name: string, fn: (data: any) => Promise<any>) {
  if (!currentFlow) {
    throw new Error("You can't call `check` outside of a flow.");
  }
  const parentFlow = FLOWS.get(currentFlow.id);
  const assertion = new Assertion({ id: parentFlow.assertions.size, name });
  FLOWS = FLOWS.set(parentFlow.id, parentFlow.with({
    assertions: parentFlow.assertions.push(assertion),
  }));
  FLOW_FNS = FLOW_FNS.update(parentFlow.id, (fns) => fns.push((data: any) => {
    /* tslint:disable-next-line:no-console */
    console.log("CHECK: " + name);
    return Promise.resolve().then(() => fn ? fn(data) : data).then((value) => {
      // Re-fetch flow & assertion value out of globals because our reverences
      // are pointing to outdated immutable versions
      const f = FLOWS.get(parentFlow.id);
      const a = f.assertions.get(assertion.id);

      // Compute assertion result
      let result = AssertionResult.New;
      if (a.snapshot) {
        try {
          deepEqual(value, JSON.parse(a.snapshot));
          result = AssertionResult.Match;
        } catch (e) {
          /* tslint:disable:no-console */
          console.log("     : " + JSON.stringify(value));
          console.log("     : !=");
          console.log("     : " + a.snapshot);
          /* tslint:enable:no-console */
          result = AssertionResult.Miss;
        }
      }

      // Save assertion result & new snapshot value
      FLOWS = FLOWS.set(f.id, f.with({
        assertions: f.assertions.set(a.id, a.with({
          result, value: JSON.stringify(value),
        })),
      }));
    });
  }));
}

export async function run(flows: List<Flow>) {
  // Merge registered flows with provided flows (w/ snapshots)
  for (const f of flows) {
    const fMatch = FLOWS.find((f2) => f2.name === f.name);
    if (fMatch) {
      let mergedAssertions = f.assertions;
      for (const a of f.assertions) {
        const aMatch = fMatch.assertions.find((a2) => a2.name === a.name);
        if (aMatch) {
          mergedAssertions = mergedAssertions.set(aMatch.id, aMatch.with({
            result: a.result,
            snapshot: a.snapshot,
          }));
        } else {
          mergedAssertions = mergedAssertions.push(a.with({id: mergedAssertions.size}));
        }
      }
      FLOWS = FLOWS.set(f.id, f.with({assertions: mergedAssertions}));
    } else {
      FLOWS = FLOWS.push(f.with({id: FLOWS.size}));
    }
  }

  // Run flows
  for (const f of FLOWS.toSeq()) {
    /* tslint:disable-next-line:no-console */
    console.log(" FLOW: " + f.name);
    const fns = FLOW_FNS.get(f.id);
    let result = null;
    for (const fn of fns) {
      result = await fn(result);
    }
  }

  return FLOWS;
}
