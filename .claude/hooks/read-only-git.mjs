// PreToolUse guard for the ai-code-reviewer subagent. The agent needs Bash to
// read the diff, but Bash can do anything, and an agent's `tools:` list only
// names tools; it cannot narrow Bash to certain commands. So every command the
// reviewer runs passes through here first, and anything that is not a plain
// read-only git command is refused. Exit code 2 blocks the call and hands the
// message on stderr back to the agent.

const ALLOWED = new Set(["diff", "log", "show", "status", "rev-parse"]);

function refuse(reason) {
  process.stderr.write(
    `Blocked: ${reason} The reviewer may only run read-only git commands ` +
      `(git ${[...ALLOWED].join(", git ")}, git branch --show-current).\n`,
  );
  process.exit(2);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let command;
  try {
    command = String(JSON.parse(input).tool_input?.command ?? "").trim();
  } catch {
    refuse("the hook could not read the command.");
  }

  // Chaining, pipes, redirection and substitution would let a harmless-looking
  // git command carry a second, arbitrary one along with it.
  if (/[;&|<>`$\n\r]/.test(command)) {
    refuse("shell operators are not allowed.");
  }

  const [program, subcommand, ...args] = command.split(/\s+/);
  if (program !== "git") refuse(`"${program}" is not git.`);

  // `git diff --output=<file>` and `git log --output=<file>` write to disk.
  if (args.some((arg) => arg.startsWith("--output"))) {
    refuse("--output writes a file.");
  }

  const showCurrent =
    subcommand === "branch" && args.length === 1 && args[0] === "--show-current";
  if (!ALLOWED.has(subcommand) && !showCurrent) {
    refuse(`"git ${subcommand ?? ""}" is not a read-only command.`);
  }

  process.exit(0);
});
