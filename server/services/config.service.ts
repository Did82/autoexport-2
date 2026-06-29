import {
    CONFIG_SCHEMA_VERSION,
    getConfig,
    normalizeConfig,
    updateConfig,
    type Config,
} from '../libs/config';
import { validateManagedRoots } from '../utils/securityUtils';

const ALLOWED_FIELDS = new Set([
    'schemaVersion',
    'src',
    'dest',
    'srcLimit',
    'destLimit',
    'cleanupDays',
    'quarantineDays',
]);

export function getConfigService(): Config {
    return getConfig();
}

export function prepareConfigUpdate(input: unknown): Config {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Request body must be a JSON object');
    }

    const patch = input as Record<string, unknown>;
    for (const key of Object.keys(patch)) {
        if (!ALLOWED_FIELDS.has(key)) {
            throw new Error(`Unknown config field: ${key}`);
        }
    }

    if (
        patch.schemaVersion !== undefined &&
        patch.schemaVersion !== CONFIG_SCHEMA_VERSION
    ) {
        throw new Error(`schemaVersion must be ${CONFIG_SCHEMA_VERSION}`);
    }

    const merged = normalizeConfig({ ...getConfig(), ...patch });
    const paths = validateManagedRoots(merged.src, merged.dest);

    return { ...merged, ...paths };
}

export function persistConfigService(config: Config): Promise<Config> {
    return updateConfig(config);
}
