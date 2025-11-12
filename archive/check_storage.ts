import { parseArgs } from "@std/cli/parse-args";
import { getDiskUsage } from "@brettchalupa/deno-disk-usage";
import Logger from "./utils/logger.ts";

const { path } = parseArgs(Deno.args, {
  string: ["path"],
});

const getGB = (mib?: number) => Math.ceil((mib ?? 0) * 0.00104858);

const diskUsage = await getDiskUsage(path ?? "/");

Logger.info(`${getGB(diskUsage?.used)} GB / ${getGB(diskUsage?.size)} GB`);
