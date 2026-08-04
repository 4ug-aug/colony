import { expect, test } from "bun:test";
import { renderSystemdUnit, requireLinux } from "./service";

test("renders the Linux user unit with absolute runtime paths", () => {
  const unit = renderSystemdUnit({
    bun: "/home/sweat/.bun/bin/bun",
    database: "/home/sweat/Sweat Server/project/gui/sweat.sqlite",
    envFile: "/home/sweat/Sweat Server/.env.local",
    path: "/home/sweat/.bun/bin:/usr/bin",
    workingDirectory: "/home/sweat/Sweat Server/project/gui",
  });

  expect(unit).toContain(
    "WorkingDirectory=/home/sweat/Sweat\\x20Server/project/gui",
  );
  expect(unit).toContain(
    'ExecStart="/home/sweat/.bun/bin/bun" "--env-file=/home/sweat/Sweat Server/.env.local" "run" "src/server/coordinator.ts"',
  );
  expect(unit).toContain(
    'Environment="SWEAT_DATABASE_PATH=/home/sweat/Sweat Server/project/gui/sweat.sqlite"',
  );
  expect(unit).toContain('Environment="PATH=/home/sweat/.bun/bin:/usr/bin"');
  expect(unit).not.toContain("NODE_EXTRA_CA_CERTS");
  expect(unit).toContain(
    "Restart=on-failure\nRestartSec=5s\nTimeoutStopSec=30s",
  );
  expect(unit).toContain("WantedBy=default.target");
});

test("hoists NODE_EXTRA_CA_CERTS into the unit environment", () => {
  const unit = renderSystemdUnit({
    bun: "/home/sweat/.bun/bin/bun",
    database: "/srv/sweat.sqlite",
    envFile: "/srv/.env.local",
    nodeExtraCaCerts: "/srv/certs/company-ca.pem",
    path: "/usr/bin",
    workingDirectory: "/srv/sweat/project/gui",
  });

  expect(unit).toContain(
    'Environment="NODE_EXTRA_CA_CERTS=/srv/certs/company-ca.pem"',
  );
});

test("background installation is Linux-only", () => {
  expect(() => requireLinux("darwin")).toThrow("supports Linux only");
  expect(() => requireLinux("linux")).not.toThrow();
});

test("systemd unit values reject newlines", () => {
  expect(() =>
    renderSystemdUnit({
      bun: "/usr/bin/bun\nExecStart=/bin/false",
      database: "/srv/sweat.sqlite",
      envFile: "/srv/.env.local",
      path: "/usr/bin",
      workingDirectory: "/srv/sweat",
    }),
  ).toThrow("cannot contain newlines");
});
