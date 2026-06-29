import { dbHelpers } from '../libs/db';

const FILESYSTEM_LEASE = 'filesystem-mutations';
export const LEASE_DURATION_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const LEASE_RETRY_MS = 500;
const PROCESS_OWNER = `${process.pid}:${Bun.randomUUIDv7()}`;

let tail: Promise<void> = Promise.resolve();
const pendingByName = new Map<string, Promise<void>>();

function timestamp(offsetMs = 0): string {
    return new Date(Date.now() + offsetMs).toISOString();
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function waitForLease(ownerId: string): Promise<void> {
    while (true) {
        const now = timestamp();
        if (
            dbHelpers.acquireLease({
                name: FILESYSTEM_LEASE,
                ownerId,
                now,
                expiresAt: timestamp(LEASE_DURATION_MS),
            })
        ) {
            return;
        }
        await Bun.sleep(LEASE_RETRY_MS);
    }
}

async function executeTrackedJob(
    id: string,
    name: string,
    task: () => Promise<void>
): Promise<void> {
    const ownerId = `${PROCESS_OWNER}:${id}`;
    let acquired = false;
    let heartbeat: Timer | null = null;

    try {
        await waitForLease(ownerId);
        acquired = true;

        const startedAt = timestamp();
        dbHelpers.markJobRunning(id, startedAt);
        console.log(`[job:start] ${name}`);

        heartbeat = setInterval(() => {
            try {
                const now = timestamp();
                dbHelpers.heartbeatJob(id, now);
                if (
                    !dbHelpers.heartbeatLease({
                        name: FILESYSTEM_LEASE,
                        ownerId,
                        now,
                        expiresAt: timestamp(LEASE_DURATION_MS),
                    })
                ) {
                    console.error(`[job:lease-lost] ${name}`);
                }
            } catch (error) {
                console.error(`[job:heartbeat-error] ${name}`, error);
            }
        }, HEARTBEAT_INTERVAL_MS);
        heartbeat.unref();

        await task();
        dbHelpers.finishJob(id, 'success', timestamp());
        console.log(`[job:done] ${name}`);
    } catch (error) {
        const message = describeError(error);
        try {
            dbHelpers.finishJob(id, 'failed', timestamp(), message);
        } catch (persistError) {
            console.error(`[job:status-error] ${name}`, persistError);
        }
        console.error(`[job:error] ${name}`, error);
        throw error;
    } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (acquired) dbHelpers.releaseLease(FILESYSTEM_LEASE, ownerId);
    }
}

function createJobRun(name: string): string {
    const id = Bun.randomUUIDv7();
    dbHelpers.createJobRun({ id, name, queuedAt: timestamp() });
    return id;
}

export function enqueueFileJob(
    name: string,
    task: () => Promise<void>
): Promise<void> {
    const existing = pendingByName.get(name);
    if (existing) {
        console.log(`[job:coalesced] ${name}`);
        return existing;
    }

    const id = createJobRun(name);
    const run = tail.then(() => executeTrackedJob(id, name, task));
    pendingByName.set(name, run);
    tail = run.catch(() => undefined);
    void run.finally(() => {
        if (pendingByName.get(name) === run) pendingByName.delete(name);
    }).catch(() => undefined);

    return run;
}

export function runTrackedFileJob(
    name: string,
    task: () => Promise<void>
): Promise<void> {
    return executeTrackedJob(createJobRun(name), name, task);
}

export function markInterruptedJobsOnStartup(): number {
    const now = timestamp();
    return dbHelpers.markAbandonedJobs(
        new Date(Date.now() - LEASE_DURATION_MS * 2).toISOString(),
        now
    );
}
