import { z } from 'zod';
import { objectId } from '../../utils/helpers.js';

const text = (max) => z.string().trim().max(max);

const CHANNELS = ['inApp', 'email', 'push', 'slack'];
const NOTIFICATION_KINDS = [
  'mention',
  'assigned',
  'commented',
  'statusChanged',
  'dueSoon',
  'overdue',
  'approval',
  'slaBreach',
  'invite',
  'joinDecision',
  'achievement',
  'digest',
];

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    firstName: text(60),
    lastName: text(60),
    headline: text(160),
    bio: text(500),
    jobTitle: text(120),
    company: text(120),
    location: text(120),
    timezone: text(64),
    locale: text(16),
    pronouns: text(40),
    website: text(300),
    avatarUrl: text(500),
    avatarKey: z.string().max(20).nullable().optional(),
    coverUrl: text(500),
    links: z.array(z.object({ label: text(40), url: text(300) })).max(5),
    skills: z.array(z.string().trim().min(1).max(40)).max(30),
    availability: z
      .object({
        status: text(40),
        message: text(200),
        until: z.iso.datetime().nullable(),
        hoursPerWeek: z.number().min(0).max(168),
      })
      .partial(),
    preferences: z
      .object({
        timeFormat: z.enum(['12h', '24h']),
        startPage: text(120),
        keyboardShortcuts: z.boolean(),
      })
      .partial(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

export const sessionParamSchema = z.object({ sessionId: objectId });

export const tokenParamSchema = z.object({ tokenId: objectId });

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: text(300).optional(),
  scopes: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  orgId: objectId.nullable().optional(),
  projectId: objectId.nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

const quietTime = z.string().regex(/^\d{2}:\d{2}$/);

export const updatePrefsSchema = z.object({
  prefs: z
    .array(
      z.object({
        channel: z.enum(CHANNELS),
        kind: z.enum(NOTIFICATION_KINDS),
        enabled: z.boolean(),
        quietHours: z
          .object({ from: quietTime, to: quietTime, timezone: text(64) })
          .nullable()
          .optional(),
      }),
    )
    .max(200),
});
