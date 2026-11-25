/**
 * Contract saves that finish in the background (the editor closes at once). Anything that reads
 * the saved contract on the server — preparing / sending a contract — waits for them first, so it
 * never works from values that are still on their way.
 */
const pending = new Set<Promise<unknown>>();

export function trackContractSave<T>(save: Promise<T>): Promise<T> {
    pending.add(save);
    const done = () => pending.delete(save);
    save.then(done, done);
    return save;
}

/** Resolves once every background contract save has finished (failures included). */
export async function waitForPendingContractSaves(): Promise<void> {
    while (pending.size > 0) {
        await Promise.allSettled([...pending]);
    }
}
