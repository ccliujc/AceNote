import { describe, expect, it } from 'vitest';
import type { ParseRequest } from '@acenote/contracts';
import { defaultTimeOnlyToToday } from '../src/parse/time-only-today';

const input: ParseRequest = {
  requestId: '11111111-1111-4111-8111-111111111111',
  rawText: '',
  localDateTime: '2026-10-30T03:12:45.000Z',
  timeZone: 'Asia/Shanghai',
};
const create = {
  intent: 'create',
  task: { title: '吃饭', dueDate: null, dueTime: null, contact: null },
};

describe('time-only defaults to the received local day', () => {
  it.each([
    ['12点提醒我吃饭', '12:00'],
    ['12点钟提醒我吃饭', '12:00'],
    ['十二点吃饭', '12:00'],
    ['五点半提醒我吃饭', '05:30'],
    ['下午2点开会', '14:00'],
    ['中午十二点吃饭', '12:00'],
    ['中午一点吃饭', '13:00'],
    ['晚上十二点睡觉', '00:00'],
    ['凌晨十二点睡觉', '00:00'],
    ['上午十点一刻开会', '10:15'],
    ['下午三点三刻开会', '15:45'],
    ['十二点三十分吃饭', '12:30'],
    ['12点30吃饭', '12:30'],
    ['23点59分睡觉', '23:59'],
    ['18:45跑步', '18:45'],
    ['18：45跑步', '18:45'],
  ])('%s keeps %s even if the model omitted it', (rawText, dueTime) => {
    expect(defaultTimeOnlyToToday(create, { ...input, rawText })).toEqual({
      ...create,
      task: { ...create.task, dueDate: '2026-10-30', dueTime },
    });
  });

  it('accepts a time without a model date before applying the strict output contract', () => {
    expect(
      defaultTimeOnlyToToday(
        { ...create, task: { ...create.task, dueTime: '12:00' } },
        { ...input, rawText: '12点吃饭' },
      ),
    ).toMatchObject({ task: { dueDate: '2026-10-30', dueTime: '12:00' } });
  });
  it('does not roll past times or model-guessed tomorrow into the next day', () => {
    expect(
      defaultTimeOnlyToToday(
        {
          ...create,
          task: { ...create.task, dueDate: '2026-10-31', dueTime: '12:00' },
        },
        {
          ...input,
          rawText: '12点吃饭',
          localDateTime: '2026-10-30T15:00:00Z',
        },
      ),
    ).toMatchObject({ task: { dueDate: '2026-10-30', dueTime: '12:00' } });
  });
  it('uses the device zone instead of the UTC or server calendar day', () => {
    expect(
      defaultTimeOnlyToToday(create, {
        ...input,
        rawText: '12点吃饭',
        localDateTime: '2026-10-30T01:00:00Z',
        timeZone: 'America/Los_Angeles',
      }),
    ).toMatchObject({ task: { dueDate: '2026-10-29', dueTime: '12:00' } });
  });
  it.each([
    '吃饭',
    '明天12点吃饭',
    '周五12点吃饭',
    '改天12点吃饭',
    '2026-11-02 12点吃饭',
    '每晚12点睡觉',
    '5分钟后12点吃饭',
    '12点到13点吃饭',
    '25点吃饭',
    '12点61分吃饭',
    '9.5点吃饭',
    '整理12点建议',
    '12点3个人开会',
    '12点30公里跑步',
    '12点买3个包子和8点买牛奶',
    'tomorrow 12:30 lunch',
    '12:30 pm lunch',
  ])('does not guess a date/time for %s', (rawText) => {
    expect(defaultTimeOnlyToToday(create, { ...input, rawText })).toBe(create);
  });
  it('leaves completion intents and invalid upstream payloads for strict validation', () => {
    const complete = { intent: 'complete', completionTarget: '吃饭' };
    const invalid = {
      ...create,
      task: { ...create.task, dueTime: '25:00', extra: true },
    };
    const missing = {
      intent: 'create',
      task: { title: '吃饭', dueDate: null, contact: null },
    };
    for (const result of [
      complete,
      invalid,
      missing,
      null,
      {},
      { ...create, task: { ...create.task, dueDate: '2026-02-30' } },
    ]) {
      expect(
        defaultTimeOnlyToToday(result, { ...input, rawText: '12点吃饭' }),
      ).toBe(result);
    }
  });
  it('does not invent a local date for an invalid zone', () => {
    expect(
      defaultTimeOnlyToToday(create, {
        ...input,
        rawText: '12点吃饭',
        timeZone: 'invalid/zone',
      }),
    ).toBe(create);
  });
});
