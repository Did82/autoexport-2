import { getConfig, updateConfig, type Config } from '../libs/config';
import { validateAndNormalizePath } from '../utils/securityUtils';

export function getConfigService(): Config {
    return getConfig();
}

function validatePath(path: string, fieldName: string): string {
    const trimmed = path.trim();
    if (!trimmed) {
        throw new Error(`${fieldName} не может быть пустой`);
    }

    const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

    if (!normalized.startsWith('/')) {
        throw new Error('Путь должен быть абсолютным (начинаться с /)');
    }

    // Try to validate if path exists, but allow non-existent paths
    try {
        return validateAndNormalizePath(normalized);
    } catch {
        // Path doesn't exist, but that's OK for initial setup
        return normalized;
    }
}

export function updateConfigService(newConfig: Partial<Config>): Config {
    // Validate and normalize paths if provided
    if (newConfig.src !== undefined) {
        newConfig.src = validatePath(newConfig.src, 'Исходная директория');
    }

    if (newConfig.dest !== undefined) {
        newConfig.dest = validatePath(newConfig.dest, 'Целевая директория');
    }

    // Validate limit
    if (newConfig.limit !== undefined) {
        if (newConfig.limit < 0 || newConfig.limit > 100) {
            throw new Error('Limit must be between 0 and 100');
        }
    }

    // Validate cleanupDays
    if (newConfig.cleanupDays !== undefined) {
        if (newConfig.cleanupDays < 0 || newConfig.cleanupDays > 365) {
            throw new Error('cleanupDays must be between 0 and 365');
        }
    }

    return updateConfig(newConfig);
}
