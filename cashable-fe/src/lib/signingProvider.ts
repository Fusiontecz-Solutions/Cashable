import { useEffect, useState } from "react";
import { axiosGet } from "@/redux/axios";

/**
 * The e-signature service new contracts go through (server setting SIGNING_PROVIDER):
 * PearSign or BoldSign. Screens show its name; it is loaded once per page load.
 */
type SigningProviderInfo = { provider: "pearsign" | "boldsign"; name: string; sandbox?: boolean };

let cached: SigningProviderInfo | null = null;
let pending: Promise<SigningProviderInfo | null> | null = null;
const listeners = new Set<() => void>();

export function loadSigningProvider(): Promise<SigningProviderInfo | null> {
    if (cached) return Promise.resolve(cached);
    if (!pending) {
        pending = axiosGet("/pearsign/provider")
            .then((res) => {
                const data = res?.data?.data as SigningProviderInfo | undefined;
                if (data?.name) {
                    cached = data;
                    listeners.forEach((l) => l());
                }
                return cached;
            })
            .catch(() => {
                pending = null; // retry on the next call
                return null;
            });
    }
    return pending;
}

/** Display name of the active e-signature service ("PearSign" until the server says otherwise). */
export function signingProviderName(): string {
    if (!cached) void loadSigningProvider();
    return cached?.name ?? "PearSign";
}

/** Re-renders the component once the provider name is known. */
export function useSigningProviderName(): string {
    const [name, setName] = useState(signingProviderName());
    useEffect(() => {
        const update = () => setName(signingProviderName());
        listeners.add(update);
        void loadSigningProvider().then(update);
        return () => {
            listeners.delete(update);
        };
    }, []);
    return name;
}
