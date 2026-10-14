import * as memories from '../../database/repositories/memories.js';
import { localDate } from '../../utils/dates.js';
import { sendDatePage } from '../render.js';

export const todayCommand = (ctx) => sendDatePage(ctx, ctx.state.user.id, localDate(ctx.state.user.timezone), memories);
