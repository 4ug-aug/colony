# Server service management research

Status: the minimal Linux/source-checkout slice is implemented. macOS and
standalone release installation remain research only.

## Question

make server currently runs the coordinator in the foreground. What should manage it as a real service: start on boot, restart after crashes, provide logs, and expose explicit start/stop/status controls?

## Current shape

The current [server target](../../Makefile#L52-L53) runs migrations, prepares the configured Apple Container or Docker agent image, and then starts [bun ... run coordinator](../../Makefile#L96-L97) as the long-lived process.

The coordinator itself also runs migrations during startup, opens SQLite in WAL mode, owns the HTTP/WebSocket listener, and invokes the selected container CLI for short-lived agent sandboxes. The release archive is a Bun-hosted JavaScript bundle, not a server container; its instructions start 'bun src/server/coordinator.js' directly.

The service manager therefore needs to run the host Bun process as the same user that owns the database, attachments, environment file, and container-runtime credentials.

## Options

| Option | Platforms | Strengths | Main cost for Sweat | Fit |
| --- | --- | --- | --- | --- |
| launchd LaunchAgent | macOS | Native startup, crash relaunch, and stdout/stderr routing | A per-user agent starts after login; a system daemon complicates runtime and data permissions | Best macOS path |
| systemd service | Linux | Native startup, restart policy, user/group isolation, journal logs, dependency ordering | Must choose system vs user scope and grant the service user Docker access | Best Linux path |
| Docker Compose | Docker hosts | Detached lifecycle, restart policy, health checks, volumes, easy updates | Requires a coordinator image and a design for the coordinator to launch agent containers | Good Docker-only alternative |
| PM2 | macOS/Linux/Windows | Cross-platform process UI, logs, restart, startup-hook generation | Adds another daemon and ultimately uses native service managers | Viable, but unnecessary |
| Supervisor | Unix-like systems | Simple config, restart, logs, and status | Extra Python service and another startup integration | Viable fallback |

## Recommendation

Use the operating system's service manager around the existing host Bun process.
The first implemented slice is intentionally narrower than the full option set:

- Linux source checkout: install a systemd user unit for the checkout owner and enable lingering for boot startup.
- macOS LaunchAgent and Linux system-unit installation remain possible later deployment adapters.
- Keep the foreground make server behavior for development and diagnostics.
- Expose only explicit install/uninstall commands; use systemctl and journalctl for lifecycle controls and logs.

This preserves the current coordinator and its Apple Container/Docker providers. Do not containerize the coordinator as the first step.

## macOS: launchd LaunchAgent

Apple recommends launchd for both system daemons and per-user agents. A job uses a property list with a unique Label and ProgramArguments; KeepAlive can request an always-running process; WorkingDirectory, UserName, and standard output/error paths can define the process context. See Apple's [Daemons and Services Programming Guide](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

For Sweat, the default should be a LaunchAgent under ~/Library/LaunchAgents, because that user needs to:

- read .env.local, SQLite, and attachments/;
- access the user's Docker socket, if Docker is selected; and
- access the Apple Container CLI and its user-facing service context.

A LaunchDaemon under /Library/LaunchDaemons would start before login, but it would run under a different identity/context. Use one only if we deliberately create a dedicated service account and verify that both selected container backends work from that account.

The plist should use absolute paths and a stable installation directory:

- ProgramArguments: the discovered Bun executable plus the coordinator entrypoint and environment-file arguments;
- WorkingDirectory: the stable server directory;
- RunAtLoad: true;
- KeepAlive: true, with a throttle/backoff setting;
- StandardOutPath and StandardErrorPath: under the user's log directory.

The service should be controlled through launchctl, not by backgrounding make server with &, nohup, or disown.

Apple Container already registers its own services with launchd. Its container system start command starts the container services, and container system stop deregisters them. See the [Apple Container command reference](https://github.com/apple/container/blob/main/docs/command-reference.md#system-management).

## Linux: systemd

systemd directly models this lifecycle. ExecStart identifies the long-running process; Restart=on-failure restarts it after abnormal exits; WorkingDirectory, User, and EnvironmentFile define its execution context; and WantedBy=multi-user.target is the normal boot installation hook. These behaviors are documented in the upstream [systemd.service](https://github.com/systemd/systemd/blob/main/man/systemd.service.xml), [systemd.exec](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml), and [systemd.unit](https://github.com/systemd/systemd/blob/main/man/systemd.unit.xml) manuals.

For a headless Linux server, a system unit is the cleanest deployment:

- create or use a sweat service account;
- grant it read/write access to the server directory, database, and attachments;
- grant it the minimum required container-runtime access;
- order it after Docker when SWEAT_SANDBOX_PROVIDER=docker;
- use Restart=on-failure and a nonzero RestartSec to avoid a tight crash loop; and
- use journalctl for logs.

A user unit avoids root installation and naturally runs as the user who owns the Docker context. If it must survive logout and start at boot, loginctl enable-linger USER keeps that user manager alive; the upstream [loginctl manual](https://github.com/systemd/systemd/blob/main/man/loginctl.xml) documents that behavior.

Do not put the authentication secret directly in Environment=. The systemd documentation warns that service environment variables are exposed to unprivileged clients over D-Bus. Keep the existing environment file protected on disk and pass it to Bun using its --env-file argument, or use a platform credential mechanism if stronger secret handling is later required.

## Docker Compose

Compose can make a coordinator container restart automatically, mount the SQLite and attachments data, expose port 3001, and define health/dependency behavior. Docker documents restart: unless-stopped, health checks, and production overrides in its [service reference](https://docs.docker.com/reference/compose-file/services/), [automatic restart guide](https://docs.docker.com/engine/containers/start-containers-automatically/), and [production Compose guide](https://docs.docker.com/compose/how-tos/production/).

It is not the smallest change for the current project:

- CI currently publishes only the agent image, not a coordinator image;
- the coordinator invokes Docker or Apple Container on the host to create agent sandboxes;
- a coordinator container would need access to the host Docker socket or a provider API, expanding the security boundary; and
- Apple Container is the default macOS sandbox provider, so Docker Compose is not a cross-platform solution.

Compose becomes attractive if production is intentionally narrowed to Docker and the coordinator becomes a first-class published image. That is a larger deployment-model change, not just process supervision.

## PM2 and Supervisor

PM2 supports restart, logs, and startup-hook generation for systems including systemd and launchd, according to its [startup-hook documentation](https://pm2.io/docs/runtime/guide/startup-hook/). Supervisor provides child-process restart, logging, and status control through a simple configuration file, according to its [official introduction](https://docs.supervisord.org/introduction.html).

Both can work, but they add another process manager without removing the platform-specific concerns around Bun paths, user identity, persistent files, and Docker/Apple Container access. PM2's startup hook ultimately uses the native manager, so it is mostly an additional abstraction here. They are reasonable fallback choices for a deployment that already standardizes on one; they should not be the default installation dependency.

## Constraints any implementation must handle

1. **Separate preparation from service start.** Installation prepares the agent image, while the unit runs the coordinator directly. The coordinator retains its idempotent startup migration so every start is safe.
2. **Use a stable path.** A service must not point at a temporary or versioned release directory that disappears on update. Use a stable current path or regenerate/reload the service definition during an update.
3. **Use a stable execution environment.** Service managers do not reproduce an interactive shell's PATH. The installed unit records the absolute Bun path and the installation-time PATH used to discover Docker and optional host CLIs.
4. **Preserve persistent data.** The source checkout is the stable location for this slice. SQLite and attachments/ must be backed up together before replacing or moving it.
5. **Handle runtime readiness.** Native status currently reports process state. HTTP and container-runtime readiness remain deferred diagnostics.
6. **Handle shutdown deliberately.** Signal handling stops the Bun server and cancels active runs, allowing their sandboxes, workspaces, and capability sessions to be disposed before exit.
7. **Avoid duplicate instances.** Port binding rejects a foreground coordinator already using the configured port; systemctl status and journal logs expose that failure without custom detection logic.
8. **Treat Docker access as privileged.** Membership in the Docker socket's access group is powerful host access. The service account and provider choice need to be documented as part of setup.

## Implemented minimal slice

1. make service-install prepares the image and installs an enabled systemd user unit with absolute checkout, Bun, environment, database, and PATH values.
2. loginctl lingering starts the user's manager at boot; the unit restarts the coordinator after failures and sends logs to the journal.
3. make service-upgrade runs `git pull --ff-only`, installs locked dependencies, prepares the agent image, regenerates the unit, and restarts the coordinator.
4. make service-uninstall removes only the unit. It deliberately leaves lingering unchanged because other user processes may rely on it.
5. SIGTERM and SIGINT stop new server work and cancel active runs so their sandboxes are disposed before exit.
6. make server remains the foreground command. systemctl and journalctl remain the operational interface rather than being wrapped by shallow Make targets.

Deferred work includes macOS, standalone release installation, a system-wide Linux account, and readiness probing.

## Conclusion

The minimal supported background deployment is now a Linux systemd user unit running the Bun coordinator from a stable source checkout. Add another native adapter only when a second deployment platform is required. Consider Docker Compose only if production is intentionally narrowed to Docker and the coordinator becomes a published image.
