import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('sync personal read-only Akahu connection', { hours: 24 }, internal.akahuActions.scheduledSync, {});
export default crons;
