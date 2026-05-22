import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { findRepoRoot } from "@/apps/dashboard/lib/scan-results";

export const dynamic = "force-dynamic";
// A full scan + downstream reports can take a while; don't let Next time it out.
export const maxDuration = 300;

/**
 * Run one scan cycle (`scan:auto:once`): capture from books, normalize,
 * detect edges, and rewrite the CSV artifacts the /scan page reads. We stream
 * the child's combined output into the response so the UI can surface failures.
 */
export async function POST() {
  const root = findRepoRoot();

  const result = await new Promise<{ code: number; output: string }>((res) => {
    const child = spawn(
      "npm",
      ["run", "scan:auto:once"],
      { cwd: root, shell: process.platform === "win32" },
    );

    let output = "";
    const cap = (buf: Buffer) => {
      output += buf.toString();
      if (output.length > 20000) output = output.slice(-20000);
    };
    child.stdout.on("data", cap);
    child.stderr.on("data", cap);

    child.on("error", (err) => res({ code: 1, output: `${output}\nspawn error: ${err.message}` }));
    child.on("close", (code) => res({ code: code ?? 1, output }));
  });

  const ok = result.code === 0;
  return Response.json(
    { ok, exitCode: result.code, log: result.output.split("\n").slice(-40).join("\n"), root: resolve(root) },
    { status: ok ? 200 : 500 },
  );
}
