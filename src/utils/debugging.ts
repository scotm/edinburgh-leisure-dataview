import util from "util";

export function getDeepObject(obj: unknown) {
  return util.inspect(obj, {
    showHidden: false,
    depth: null,
    colors: true,
  });
}
