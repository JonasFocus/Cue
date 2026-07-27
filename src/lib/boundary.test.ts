import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

/* The client/server boundary, enforced statically.
 *
 * A `"use client"` module that imports — at runtime, not as a type — anything
 * reaching `pg` or `redis` puts a Node-only driver in the browser bundle. The
 * bundler then tries to resolve `dns`, `fs` and `net` for the browser and the
 * build dies.
 *
 * This happened on 2026-07-26: a console component imported two plan constants
 * from a module that also held database queries. What made it expensive is that
 * `tsc`, `eslint` and `node --test` were ALL green throughout — none of them
 * models the boundary — so it was reported as verified and only `next build`
 * disagreed. A full build is slow and was off-limits to parallel agents, so the
 * break sat there.
 *
 * This test is the fast version of that build. It walks the real import graph
 * from every client entry point and fails with the exact chain.
 */

const SRC = resolve(import.meta.dirname, "..");

/** Modules that open sockets or read secrets. Never reachable from the client. */
const SERVER_ONLY = new Set(["lib/db", "lib/redis", "lib/docker", "lib/auth"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Runtime imports only — `import type` is erased and cannot drag anything in. */
function runtimeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs: string[] = [];

  const re = /^\s*(?:import|export)\s+(?!type\s)([\s\S]*?)from\s+["']([^"']+)["']/gm;
  for (const [, clause, spec] of source.matchAll(re)) {
    // `import { type Foo, bar }` still imports `bar` at runtime; a clause whose
    // every binding is `type`-prefixed does not.
    const bindings = clause.match(/\{([\s\S]*)\}/)?.[1];
    if (bindings && bindings.split(",").every((b) => !b.trim() || /^type\s/.test(b.trim()))) {
      continue;
    }
    specs.push(spec);
  }

  /* Dynamic `import()` counts too, and missing this made the first version of
     this test a false green. A lazy `await import("./db")` reads like a
     boundary — it is not. The bundler follows it exactly as far as a static
     import; all it changes is which chunk the code lands in. */
  for (const [, spec] of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specs.push(spec);
  }

  return specs;
}

function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package, not our source

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        if (readdirSync(candidate)) continue; // it is a directory
      } catch {
        return candidate;
      }
    }
  }
  return null;
}

function key(file: string): string {
  return file.slice(SRC.length + 1).replace(/\.tsx?$/, "");
}

test("no client component can reach a server-only module", () => {
  const files = walk(SRC);
  const clientEntries = files.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

  assert.ok(clientEntries.length > 0, "found no client components — the walk is broken");

  for (const entry of clientEntries) {
    // Depth-first, carrying the chain so a failure names the whole path.
    const stack: Array<{ file: string; chain: string[] }> = [
      { file: entry, chain: [key(entry)] },
    ];
    const seen = new Set<string>();

    while (stack.length) {
      const { file, chain } = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);

      const source = readFileSync(file, "utf8");
      // A "use server" module crossing the boundary becomes a client *reference*
      // — the bundler replaces it with an RPC stub, so its imports stay server-side.
      if (file !== entry && /^\s*["']use server["']/.test(source)) continue;

      assert.ok(
        !SERVER_ONLY.has(key(file)),
        `client component reaches a server-only module:\n    ${chain.join("\n      → ")}\n` +
          `  This builds fine under tsc, eslint and node --test, and fails only in \`next build\`.`,
      );

      for (const spec of runtimeImports(file)) {
        const target = resolveSpec(spec, file);
        if (target) stack.push({ file: target, chain: [...chain, key(target)] });
      }
    }
  }
});
