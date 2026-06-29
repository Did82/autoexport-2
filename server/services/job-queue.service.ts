let tail: Promise<void> = Promise.resolve();

export function enqueueFileJob(
    name: string,
    task: () => Promise<void>
): Promise<void> {
    const run = tail.then(async () => {
        console.log(`[job:start] ${name}`);
        try {
            await task();
            console.log(`[job:done] ${name}`);
        } catch (error) {
            console.error(`[job:error] ${name}`, error);
            throw error;
        }
    });

    tail = run.catch(() => undefined);
    return run;
}
