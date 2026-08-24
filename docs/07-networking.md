# Hosting and connecting

## The model

One computer runs the team. It holds the project folder, the bots' work, and
the history. Everything else is a window onto it.

The desktop app is both. Choose **New team** or open a recent project and it
becomes the host. Choose **Connect to a computer** and it is a client.

## Hosting

When the app hosts a project it starts the server on `0.0.0.0` so a peer on
your tailnet can reach it. The token is the gate, not the bind address.

Headless, on a machine with no display:

```bash
pnpm serve /path/to/project --host 0.0.0.0 --port 7788
```

It prints the address and pairing code on startup.

## Connecting from another device

1. On the host, open **Settings**. It shows the address and the pairing code.
2. On the other device, choose **Connect to a computer** and enter both.

The address is your host's Tailscale IP (`100.x.y.z`) or its MagicDNS name.
OpenBot reads it from the `tailscale` CLI when it is installed; if Tailscale is
not running you get the loopback address, which only works on that machine.

## Why Tailscale

Two devices on a tailnet talk over an encrypted WireGuard link with no port
forwarding, no public exposure, and no dynamic DNS. OpenBot does not implement
its own transport security because it does not need to. It rides on the tunnel
you already trust.

The token is a second gate, so a device that is on your tailnet still cannot
read your chats without being paired.

## What is actually exposed

Everything under `/api` and `/ws` requires the token. `/api/health` does not,
so a device can check reachability before pairing; it returns only liveness and
the project's name.

A bot's own reach is bounded separately, by the Codex sandbox and its
workspace grants. See [04-providers.md](04-providers.md).

## Ports

A project records a port in `settings.port`, 7788 by default. If it is taken,
the server walks up to the next free port, and falls back to one the OS picks.
Creating a team never fails because a number was busy.

The address shown in Settings is the port actually in use, so pair from there
rather than assuming 7788.

## When the host changes

The main process owns which team is hosted. It tells the window whenever that
changes, and the window follows. Opening a second team closes the first and
moves the chat across rather than leaving a window talking to a server that has
gone.

If a token is rejected, the app re-reads where it should be instead of
retrying. That is what a rejected token means: the host is serving something
else now.

## Limits worth knowing

- **One team per app window.** Opening a second closes the first.
- **No replay on the socket.** A client that reconnects refetches state. Fine
  at chat volume; something to revisit for very long histories.
- **The token does not rotate.** Deleting `.openbot/token` mints a new one on
  next start and unpairs every device.
- **Plain HTTP.** Deliberate: Tailscale provides the encrypted link. Do not
  bind to `0.0.0.0` on an untrusted network without a tunnel in front.
