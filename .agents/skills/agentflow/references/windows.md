# Windows

Read this before running Agentflow commands in native Windows PowerShell or cmd. Claude Code's Bash tool on Windows is Git Bash: use the POSIX forms in `SKILL.md` there unchanged.

## Standard input without a heredoc

PowerShell has no heredoc. For `agf start --message-stdin`, `agf close --manifest-stdin`, and every `notebook-write.js … --input-stdin` command, pipe a single-quoted here-string after setting UTF-8 in both directions:

```powershell
$u = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = $u; [Console]::InputEncoding = $u; @'
<exact owner message>
'@ | node '<active-agentflow-skill-dir>\scripts\agf.js' start --repo '<repo>' --host <safe-id> --message-stdin --json
```

- `@'` ends its line, and the closing `'@` starts a line with nothing before it. Everything between is literal: `$`, backticks and quotes are not interpreted.

- By default Windows PowerShell 5.1 sends non-ASCII text as `?`. Setting only `$OutputEncoding` adds a byte-order mark, which Agentflow drops.

- If a line of the message itself begins with `'@`, send the message through the host's own standard-input mechanism instead.

- Stdin closes when the pipeline ends. Never create an input file.

## Commands and paths

- Quote paths in single quotes and double an embedded `'`. Windows PowerShell 5.1 has no `&&`; chain dependent commands as `first; if ($?) { second }`. Agentflow prints its suggested commands in this form on Windows.

- Install the `agf` and `agf-looper` shortcuts with `node '<active-agentflow-skill-dir>\scripts\setup.js' --fix --profile $PROFILE`, and pass the same `--profile $PROFILE` to `agf uninstall`. Restart the shell afterwards.

- `export` and Unix utilities in other examples need a Unix shell. Run WSL examples entirely inside WSL with its own Node and Git.

## Workers and records

- Workers start without a shell. A bare worker name resolves to a native `.exe` or `.com`, or to the program an npm `.cmd` wrapper runs. `AGF_OPEN` may name a `.cmd` editor such as `code`.

- Cancellation terminates the worker's whole process tree forcefully, because Windows has no graceful process-group signal.

- Nested-worker detection needs a POSIX process table. On Windows `nested_worker.visible` stays `false`; treat a worker run as unproven for nested-agent containment.

- `agf-looper` runs natively. Windows grants access through ACLs rather than POSIX permission bits, so its state directory relies on the user profile's ACL.

- Completion cleanup sends old records to the Recycle Bin, or to an installed `trash` command.
