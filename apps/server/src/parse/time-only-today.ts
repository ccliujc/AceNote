import {
  dueTimeSchema,
  parsedTaskSchema,
  type ParseRequest,
} from '@acenote/contracts';

const numberChars = '0-9零〇一二两三四五六七八九十百千万';
const daypart = '凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|夜间';
const clockPattern = new RegExp(
  `(?<![${numberChars}.])(?:(${daypart})\\s*)?([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\\s*点(?:钟)?\\s*(?:(半|一刻|三刻)|([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\\s*分?)?`,
  'g',
);
const colonPattern = new RegExp(
  `(?<![${numberChars}.])(?:(${daypart})\\s*)?([0-9]{1,2})[:：]([0-9]{2})(?![0-9])`,
  'g',
);
const dateReference =
  /今天|今日|今早|今晚|明天|明日|明早|明晚|后天|昨天|昨日|昨晚|前天|[本这下上]周|周[一二三四五六日天末]|星期|礼拜|[0-9零〇一二两三四五六七八九十]+\s*[年月日号]|\d{1,4}[-/.]\d{1,2}|过几天|改天|以后|之后|下次|届时|每|隔天|过会|稍后|待会|一会|最近|某天|有空|(?:分钟?|小时|秒钟?|天|周)\s*后|\b(?:today|tomorrow|tonight|yesterday|next|every|later|after|a\.?m\.?|p\.?m\.?)\b/i;

function number(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    if (tens!.length > 1 || (ones?.length ?? 0) > 1) return NaN;
    return (tens ? digits[tens]! : 1) * 10 + (ones ? digits[ones]! : 0);
  }
  return value.length === 1 ? digits[value]! : NaN;
}

function explicitTime(text: string): string | null {
  const clocks = [...text.matchAll(clockPattern)];
  const colons = [...text.matchAll(colonPattern)];
  if (clocks.length + colons.length !== 1) return null;
  const match = clocks[0] ?? colons[0]!;
  const remainder = text.slice(match.index! + match[0].length);
  // Do not interpret counts such as “12点建议” as clock times.
  if (clocks.length && /^(建议|意见|问题|要求|说明|总结)/.test(remainder))
    return null;
  // “12点3个人开会” contains a quantity, not a 12:03 clock expression.
  if (
    clocks.length &&
    match[4] &&
    !match[0].trimEnd().endsWith('分') &&
    /^(个|人|项|次|条|件|页|公里|米|杯|本|块)/.test(remainder)
  )
    return null;
  let hour = number(match[2]!);
  const minute = clocks.length
    ? match[3]
      ? ({ 半: 30, 一刻: 15, 三刻: 45 } as Record<string, number>)[match[3]]!
      : match[4]
        ? number(match[4])
        : 0
    : Number(match[3]);
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  )
    return null;
  const period = match[1];
  if (period && hour > 12) return null;
  if (
    period === '下午' ||
    period === '傍晚' ||
    period === '晚上' ||
    period === '夜里' ||
    period === '夜间'
  ) {
    if (hour === 12 && period !== '下午') hour = 0;
    else if (hour > 0 && hour < 12) hour += 12;
  } else if (period === '凌晨' && hour === 12) hour = 0;
  else if (period === '中午' && hour >= 1 && hour <= 2) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Normalize only a validated create payload with a single date-free clock expression. */
export function defaultTimeOnlyToToday(
  result: unknown,
  input: ParseRequest,
): unknown {
  if (
    !result ||
    typeof result !== 'object' ||
    !('intent' in result) ||
    result.intent !== 'create' ||
    !('task' in result)
  )
    return result;
  const task = result.task;
  if (!task || typeof task !== 'object' || !('dueTime' in task)) return result;
  // Validate everything before filling the date, allowing only the missing-date refinement.
  if (
    !parsedTaskSchema.safeParse({ ...task, dueTime: null }).success ||
    !dueTimeSchema.nullable().safeParse(task.dueTime).success
  )
    return result;
  if (dateReference.test(input.rawText)) return result;
  const time = explicitTime(input.rawText);
  if (!time) return result;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: input.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(input.localDateTime));
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return {
      ...result,
      task: {
        ...task,
        dueDate: `${values.year}-${values.month}-${values.day}`,
        dueTime: time,
      },
    };
  } catch {
    return result;
  }
}
