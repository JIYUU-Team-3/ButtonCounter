# Button Counter

One button, one number, shared by everyone. Press it from any device and every other
device watching sees the count go up in realtime. The count never resets and never goes
down.

Built with SvelteKit 2 + Svelte 5 (runes) and Tailwind CSS 4. Realtime propagation uses
SvelteKit's own `query.live` remote functions, which stream over Server-Sent Events; the
count is stored in Turso (libSQL).

Deployed and working at
<https://button-counter-mellowing-island-2485-production-18e9.up.railway.app/>.

## Local setup

```sh
npm install
```

Create a `.env` (it is gitignored) with the Turso credentials:

```env
TURSO_DATABASE_URL=xxxx
TURSO_AUTH_TOKEN=xxxx
```

Then start the dev server:

```sh
npm run dev

# reachable from phones on the same Wi-Fi
npm run dev -- --host
```

To apply the schema to Turso:

```sh
npm run generate
```

## Multi-device sync verification

This is the acceptance procedure for issue #13 — it proves that all devices converge on
the same count (R2) and that the count survives a reload (R3).

### Before you start

- **Confirm the server runs exactly one instance.** The realtime broadcast is an
  in-process `Set` of listeners in `src/lib/server/counter.ts`, and the current value is
  cached in a module-level promise in the same file. Neither is shared between
  processes, so with two or more replicas a press on one instance is invisible to
  devices attached to the other until they reload. Scale the deployment to a single
  replica for the run, or the results mean nothing. (The run below confirms the current
  deployment is a single replica: every client saw every push.)
- **Note the starting count** before the first press. Every check below is expressed as
  a delta from it.
- Three devices is the target. Two phones plus a laptop works; three separate browser
  profiles is an acceptable substitute if hardware is short.

### Procedure

1. **Converge on increment.** Open the app on all three devices. Press once on device A;
   confirm B and C both move to the same number without being touched. Repeat from B,
   then from C.
2. **No lost updates under concurrency.** Have two devices press as fast as they can at
   the same time, roughly 30 presses each. Count the presses. When both stop, confirm
   all three devices settle on the same number, and that it rose by exactly the total
   number of presses.
3. **Stored value equals total presses.** Read the row straight out of the database:

   ```sql
   select count from counts where id = 1;
   ```

   Confirm it equals `starting count + total presses across all devices`. This is the
   check that matters most: it is what catches a non-atomic read-then-write increment.
   Reading through the UI is *not* a substitute — the server caches the value in memory,
   so a page reload replays the cache rather than re-reading the database.
4. **Offline catch-up.** Take one device offline (airplane mode, or DevTools →
   Network → Offline). Press several times on another device. Bring the first device
   back online. Confirm it catches up to the shared number **on its own**, without a
   manual reload. Needing a reload is a failure of this step, and belongs to issue #12.
5. **Persistence across reload.** Reload all three devices and confirm the count is
   unchanged. To prove persistence properly rather than just proving the in-memory
   cache, restart the server (or redeploy) before reloading, so the value has to come
   back out of the database.

### Results

Run on 2026-08-22 against the deployed Railway instance, driving three concurrent SSE
clients and the `increment` command directly over HTTP.

| Step | Expected | Observed | Result |
| --- | --- | --- | --- |
| 1. Converge on increment | All clients move to the same number without interaction | All three streams received every update; each saw 61 events (1 initial + 60 pushes) | Pass |
| 2. No lost updates | 60 concurrent presses raise the count by exactly 60 | 2908 → 2968, delta exactly 60 with 20-way parallelism | Pass |
| 3. Stored value equals total presses | Database row matches starting count + presses | The increment is a single atomic `update counts set count = count + 1 returning count`, and the returned values formed an unbroken run to 2968 | Pass |
| 4. Offline catch-up | Disconnected client resyncs on its own | Not run — needs a real browser. SvelteKit's live query does implement automatic retry with backoff, so this is expected to pass; confirm before closing issue #12 | Not run |
| 5. Persistence across reload | Count survives a reload and a server restart | Not run against a restart — needs a redeploy. The value is read back from Turso on a cold process, but `readCount()` memoises per process, so only a restart proves it | Partial |

Steps 1-3 — the substance of R2, including the non-atomic-increment trap the issue calls
out — pass on the deployed app. Steps 4 and 5 need a browser and a server restart
respectively.

### Note on the WebSocket layer

`socket.io`, `socket.io-client`, `svelte-realtime` and `svelte-adapter-uws` are all
installed, and `src/hooks.ws.ts` wires an upgrade handler, but **none of it carries
application traffic**. There are no `live()` exports for `svelte-realtime` to pick up —
on boot it logs `Plugin loaded but no live modules found in src/live/` — and
`socket.io` is never imported anywhere in `src/`.

Sync instead rides on SvelteKit's native `query.live`, which is plain streaming HTTP and
which `@sveltejs/adapter-node` serves correctly. So the absent production WebSocket does
**not** block this acceptance test. An earlier draft of this section claimed it did,
based on the server-rendered HTML showing `Disconnected` and a disabled button; that
markup is identical in local dev, because `count.connected` is simply false until the
client hydrates and opens the stream. The unused packages are worth removing, but that
is cleanup, not a blocker.
