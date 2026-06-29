import { describe, expect, test } from 'bun:test';
import { normalizeConfig } from '../server/libs/config';
import { getDateNDaysAgo, isValidDateDirectory } from '../server/utils/utils';

describe('config migration and validation', () => {
    test('migrates the legacy limit into both storage limits', () => {
        const config = normalizeConfig({
            src: '/tmp/src',
            dest: '/tmp/dest',
            limit: 64,
            cleanupDays: 45,
        });

        expect(config).toMatchObject({
            schemaVersion: 2,
            srcLimit: 64,
            destLimit: 64,
            cleanupDays: 45,
            quarantineDays: 7,
        });
        expect(config).not.toHaveProperty('limit');
    });

    test('keeps independent source and destination limits', () => {
        const config = normalizeConfig({
            src: '/tmp/src',
            dest: '/tmp/dest',
            srcLimit: 61,
            destLimit: 83,
            cleanupDays: 90,
            quarantineDays: 7,
        });

        expect(config.srcLimit).toBe(61);
        expect(config.destLimit).toBe(83);
    });

    test('rejects unsafe numeric values', () => {
        expect(() =>
            normalizeConfig({
                src: '/tmp/src',
                dest: '/tmp/dest',
                srcLimit: 0,
                destLimit: 78,
                cleanupDays: 90,
                quarantineDays: 7,
            })
        ).toThrow('srcLimit');
    });
});

describe('dated directory rules', () => {
    test('accepts real calendar dates only', () => {
        expect(isValidDateDirectory('20240229')).toBe(true);
        expect(isValidDateDirectory('20230229')).toBe(false);
        expect(isValidDateDirectory('20241301')).toBe(false);
        expect(isValidDateDirectory('notes')).toBe(false);
    });

    test('formats dates in the configured timezone', () => {
        expect(getDateNDaysAgo(0, 'Europe/Minsk')).toMatch(/^\d{8}$/);
    });
});
