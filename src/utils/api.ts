/**
 * API utility functions for making HTTP requests
 */

export async function fetchAPI<T = unknown>(
    endpoint: string,
    options?: RequestInit
): Promise<T> {
    // Use relative URLs - Bun's dev server handles this automatically
    const url = endpoint.startsWith('http') ? endpoint : endpoint;
    const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = errorData.error || errorData.message || response.statusText;
        throw new Error(errorMessage);
    }

    return response.json();
}
