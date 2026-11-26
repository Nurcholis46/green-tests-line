// Entrypoint for the one-line contest entry.
//
// Job: materialize exactly one line of text at /output/entry.txt,
// after proving the line satisfies every gate rule. The write is
// atomic (temp file in the same directory, then rename) so a
// crashed run can never leave a truncated entry behind, and the
// result is read back and compared byte-for-byte before success.

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// The contest line. Kept as a single literal so the file content
// is auditable at a glance and cannot drift through concatenation.
const LINE = "All tests green: the suite tests my intentions, production tests my competence.";

const TARGET = "/output/entry.txt";
const MIN_CODE_POINTS = 1;
const MAX_CODE_POINTS = 140;

// Fail fast with a clear message instead of writing a bad entry.
function fail(reason: string): never {
  console.error(`entry validation failed: ${reason}`);
  process.exit(1);
}

// Gate checks run on the in-memory value before any disk I/O.
// Code points (not UTF-16 units) are counted via spread so the
// length rule matches what a UTF-8 reader would observe.
function validate(value: string): void {
  const points = [...value].length;
  if (points < MIN_CODE_POINTS || points > MAX_CODE_POINTS) {
    fail(`length ${points} outside ${MIN_CODE_POINTS}-${MAX_CODE_POINTS} code points`);
  }
  if (value.trim() === "") {
    fail("line must not be blank or whitespace-only");
  }
  if (value.includes("\n") || value.includes("\r")) {
    fail("line must be a single line without newline or carriage return");
  }
  if (value !== value.trim()) {
    fail("line must not have leading or trailing whitespace");
  }
}

// Write via a sibling temp file, then rename over the target.
// Rename within one filesystem is atomic, so readers only ever
// see either the old entry or the complete new one.
function writeAtomically(target: string, content: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, content, { encoding: "utf8" });
  chmodSync(tmp, 0o644);
  renameSync(tmp, target);
}

// After the rename, confirm the bytes on disk are exactly the
// bytes we intended — no trailing newline, no encoding surprise.
function verifyReadBack(target: string, expected: string): void {
  const onDisk = readFileSync(target);
  const expectedBytes = Buffer.from(expected, "utf8");
  if (!onDisk.equals(expectedBytes)) {
    fail("read-back mismatch: file bytes differ from intended line");
  }
  const mode = statSync(target).mode & 0o777;
  if (mode !== 0o644) {
    fail(`expected mode 0644, found 0${mode.toString(8)}`);
  }
  // Belt and braces: the byte length on disk must equal the
  // UTF-8 byte length of the line, catching any stray newline.
  if (statSync(target).size !== expectedBytes.length) {
    fail(`expected ${expectedBytes.length} bytes on disk, found ${statSync(target).size}`);
  }
}

function main(): void {
  validate(LINE);
  writeAtomically(TARGET, LINE);
  verifyReadBack(TARGET, LINE);
  console.log(`wrote ${TARGET} (${Buffer.byteLength(LINE, "utf8")} bytes)`);
}

main();
