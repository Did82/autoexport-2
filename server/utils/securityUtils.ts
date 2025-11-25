import { existsSync, statSync } from 'fs';
import { normalize, resolve } from 'path';

export function validateAndNormalizePath(path: string): string {
    if (!path || typeof path !== 'string') {
        throw new Error('Path must be a non-empty string');
    }
    
    // Normalize path
    const normalized = normalize(path);
    
    // Resolve to absolute path
    const absolute = resolve(normalized);
    
    // Security: Only allow absolute paths (must start with /)
    if (!absolute.startsWith('/')) {
        throw new Error('Path must be absolute (start with /)');
    }
    
    // Check if path exists
    if (!existsSync(absolute)) {
        throw new Error(`Path does not exist: ${absolute}`);
    }
    
    // Check if it's a directory
    const stats = statSync(absolute);
    if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${absolute}`);
    }
    
    return absolute;
}

