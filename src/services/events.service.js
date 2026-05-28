// In-process domain event bus. Emitting never throws into callers.
import { logger } from '../utils/logger.js';
import { EVENT_TYPES } from '../config/constants.js';

const handlers = [];

export const onEvent = (handler) => {
  handlers.push(handler);
};

export const emitEvent = (event) => {
  if (!EVENT_TYPES.includes(event.type)) {
    logger.error(`Unknown event type: ${event.type}`);
    return;
  }
  const payload = { at: new Date(), ...event };
  setImmediate(() => {
    for (const handler of handlers) {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => logger.error(`Event handler failed for ${payload.type}:`, err));
    }
  });
};
